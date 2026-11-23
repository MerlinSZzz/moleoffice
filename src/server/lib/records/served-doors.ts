// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHICH DOOR MAY WRITE WHAT, AND WHO IS ASKING: the office's own writers, the proofs of a claim to be the person or
 * an agent, the doors that alone write one kind of thing, and the words for a caller Mole Office cannot place. They
 * were moved out of src/server/lib/records.ts with no change of behaviour.
 *
 * NO CALLER CHANGED. records.ts hands on everything here with `export *`. This file does not import records.ts.
 */
import { ANSWERS_FIELD, questionsIn } from '@shared/answers.ts'
import { DECISION_KIND } from '@shared/decision-kind.ts'
import { DISCOVERY_KEY } from '@shared/discovery-stamp.ts'
import { named } from '@shared/named.ts'
import { chapterNumberOf, chineseNotFromThisEnglish, type TheEnglishOfARecord } from '@shared/office-rules.ts'
import { isMoleOffice, THE_MESSAGE_WORKER_ID, THE_OFFICE_WRITER_ID, type ParticipantRef } from '@shared/participants.ts'
import { aRunSaysItIsFinished, FINISHED_STATES } from '@shared/releasing.ts'
import { sameJson } from '@shared/same-json.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import type { SummaryBlock } from '@shared/types.ts'
import { kindWord } from '@shared/words.ts'
import { gatePosition } from '../../../config/settings.mjs'
import { readParticipant } from '../../db/read-participant.ts'
import { isJsonObject } from '../../db/the-decision-names-this-fork.ts'
import { THE_DOOR_OF, type TOP_LEVEL_RUN_FIELDS_OF_THE_DOORS } from '../check-field-doors.ts'
import { announce } from '../events.ts'
import { gateMet, gateMetOnceTheWriteIsTakenBack } from '../gate-counts.ts'
import { refFrom } from '../message-pool-at-or-after.ts'
import { PanelError } from '../panel-error.ts'
import { participantForActor } from '../participant-for-actor.ts'
import type { RegisteredAgent } from '../participants.ts'
import { thePlanningDoorsAreWriting } from '../planning-door.ts'
import { theRoleCards, theRoleCardsAreRead } from '../roles.ts'
import { theAgentAnArrivingReferenceNames } from '../the-agent-an-arriving-reference-names.ts'
import { HUMAN, type Actor } from './actor.ts'
import { PROPOSAL_KIND } from './fork-settled.ts'
import { getRecord } from './reading.ts'
import type { RecordPatch } from './record-patch.ts'
import type { StoredActorStamp } from './same-agent.ts'

/**
 * WHO MAY WRITE A SESSION RECORD'S `served`. Criterion HB1.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THERE IS A GUARD AND NOT AN ORDINARY FIELD WRITE
 * ---------------------------------------------------------------------------------------
 *
 * `served` says what the runtime gave a run: the model, the temperature, the brief's size, the
 * context. That is a fact about the run that a STRANGER writing it would corrupt — the honour
 * board reads the conditions every run worked under, and a hand-written `served` on a run that
 * never was told what it served is exactly the fabricated evidence the nine invariants refuse.
 * So the write is narrowed to the three writers the criterion names, and everybody else is
 * refused with a sentence saying whose the field is.
 *
 * The three:
 *   - THE RUN ITSELF: an agent that answers for the run, which is its own agent or the agent that started it or filed
 *     it, with a key or by a call no listener carried. The runner writes at the run's end. A name with no key does not
 *     count, even while the key window is open, and a session header naming the run is not asked.
 *   - THE PERSON, proved: their key or a paired browser's, or a call no listener carried. A hand-written value,
 *     accepted and marked as theirs by the change log. A claim with no key does not count, even while the key window
 *     is open, as on a run's end.
 *   - THE SECRETARY. An agent holding the secretary card (the one the role declaration lets hold
 *     the person's authority), un-retired. Read off the registry rather than typed, so a renamed
 *     card moves with the declaration.
 *
 * The record's history shows who wrote it — every write already logs its actor, and that is
 * the other half of HB1.
 *
 * EXPORTED FOR THE GOAL'S CONFIRMATION, which asks the same question of the
 * same registry row in src/server/lib/goals.ts.
 */
export function theSecretaryOfThisOffice(actor: Actor): boolean {
  if (actor.type !== 'agent' || !theRoleCardsAreRead()) return false
  const card = theRoleCards().elevation.onlyThisCardCanHoldIt
  if (typeof card !== 'string' || card === '') return false
  // THE CALLER IS AN ARRIVING REFERENCE, so it goes through the one resolver, and the row is read by
  // the id it answers. A handle a retired agent and a live one share names the live one.
  const who = participantForActor(actor)
  const row = who === null || who.kind !== 'agent' ? null : (readParticipant(who) as RegisteredAgent | null)
  return row !== null && row.role === card && row.retired !== true
}

/**
 * THE BODY'S HALF OF A SEALED RUN'S KEY.
 * After a run has sealed or ended, its own key may still write that run's `served` conditions, and nothing else.
 * `aSealedRunsOwnKey` in lib/keys.ts lets the key prove the run's agent only on a PATCH of the run's own record, read from
 * the URL before the body is parsed; this reads the body. The patch must be that run's, and a `dataPatch` of `served`
 * alone: no other field of the record and no other key of its data. Anything else is refused and nothing is written.
 * The served guard then asks who answers for the run, as for every other writer of `served`.
 */
export function aSealedRunWritesOnlyItsServed(id: string, patch: RecordPatch, run: string): void {
  const only = patch.dataPatch !== undefined && Object.keys(patch.dataPatch).length === 1 && Object.hasOwn(patch.dataPatch, 'served')
  const nothingElse = Object.entries(patch).every(([field, value]) => field === 'dataPatch' || value === undefined)
  if (id === run && only && nothingElse) return
  throw new PanelError(
    `The key this request carried belongs to run ${run}, which has ended, and a run's key proves nobody after its end for ` +
      "every write but one: that run's own served conditions, which the launcher writes when the command ends. " +
      'This request asked for more than that. Nothing was written.',
    403,
  )
}

/** The one refusal of both halves above, and of anything else a finished run's key asks for on its doors. */
export function aFinishedRunsKeyAskedForMore(run: string): PanelError {
  return new PanelError(
    `The key this request carried belongs to run ${run}, which has finished, and for fifteen minutes after its finish a ` +
      "run's key does only three things, all for that run: store its usage receipt, post the launcher's message about how " +
      'its command ended, and read its record. This request asked for more than that. Nothing was written.',
    403,
  )
}

/** The 403's words on who may make a run carry another agent's conversation. Exported so a test reads them here. */
export const WHO_MAY_CARRY_ANOTHER_AGENTS_CONVERSATION =
  "Only the person or the office may make a run carry a conversation that another agent's own run names"

/** The conversations a run's data names: its `providerSession`, and the `externalId` of its discovery stamp. */
export function theConversationsARunNames(data: Record<string, unknown>): string[] {
  const extra = isJsonObject(data['extra']) ? (data['extra'] as Record<string, unknown>) : {}
  const stamp = isJsonObject(extra[DISCOVERY_KEY]) ? (extra[DISCOVERY_KEY] as Record<string, unknown>) : {}
  const named = [data['providerSession'], stamp['externalId']].filter((one): one is string => typeof one === 'string' && one !== '')
  return [...new Set(named)]
}

/**
 * THE OFFICE'S OWN WRITERS THAT END RUNS THEY DID NOT FILE: the API server (`sayHowThisSessionEnded` in
 * src/server/index.ts) and the message worker (lib/worker.ts in this process, src/worker/index.ts over a socket).
 * Their names are taken at their word while the key window is open, and after it closes only with a key, which the
 * message worker sends as the office's own on every request it makes as itself.
 */
const THE_OFFICE_ENDS_RUNS_AS: ReadonlySet<string> = new Set([THE_OFFICE_WRITER_ID, THE_MESSAGE_WORKER_ID])

/**
 * WHETHER THE CALLER IS THE OFFICE ITSELF: a system writer, a caller proved by the office's key, or one of the office's
 * own writers by name (`THE_OFFICE_ENDS_RUNS_AS`). Who may end a run (`assertMayEndARun`) and which parent a caller may
 * name (`whyThisCallerMayNotNameThisParent`) ask it.
 */
export function theCallerIsTheOfficeItself(actor: Actor): boolean {
  return actor.type === 'system' || actor.provedBy === 'the-office-key' || (actor.type === 'agent' && THE_OFFICE_ENDS_RUNS_AS.has(actor.id))
}

/**
 * WHETHER THE CALLER IS THE PERSON, PROVED: by their key, or from inside the office's own program, where no request
 * carried the call. A request that only says it is the person is not this. Who may end a run (`assertMayEndARun`), who may
 * write a run's served conditions (`assertMayWriteServed`) and which parent a caller may name
 * (`whyThisCallerMayNotNameThisParent`) all ask it.
 */
export function theProvedPerson(actor: Actor): boolean {
  return thePersonIsProved(actor) && (actor.provedBy === 'the-person-key' || actor.from === undefined)
}

/** The sentence a refusal that asks `theProvedPerson` adds when the caller named the person. */
export const ONLY_THE_PERSONS_KEY_PROVES_A_CLAIM = "A claim to be the person counts here only with the person's key, even while the key window is open."

/** That sentence, with the space before it, for a caller that named the person, and nothing for any other caller. */
export function aClaimToBeThePerson(actor: Actor): string {
  return actor.type === 'human' ? ` ${ONLY_THE_PERSONS_KEY_PROVES_A_CLAIM}` : ''
}

/**
 * The sentence a refusal that asks `anAgentThatAnswersForTheRun` adds when the caller named an agent that answers for
 * the run and no key proved it. Exported so a test reads the words rather than copying them.
 */
export const ONLY_A_KEY_PROVES_AN_AGENTS_CLAIM =
  'A claim to be an agent that answers for the run counts here only with a key, even while the key window is open.'

/** Whether a stored change-log stamp names the office itself: a system writer, or one of its own writers by name. */
export function aStampNamesTheOfficeItself(stamp: StoredActorStamp): boolean {
  return stamp.actorType === 'system' || (stamp.actorType === 'agent' && THE_OFFICE_ENDS_RUNS_AS.has(stamp.actorId))
}

/** The agent that started this agent, from its registry row's `startedBy`, or null when a person or nobody did. */
export function theAgentThatStarted(agentId: string): string | null {
  const row = readParticipant({ kind: 'agent', id: agentId }) as RegisteredAgent | null
  const by = row?.startedBy ?? null
  return by !== null && by.kind === 'agent' ? by.id : null
}

/**
 * WHETHER A KEY PROVES THIS REQUEST, OR NO LISTENER CARRIED IT. A key is an agent's key, which proves the agent itself
 * or, under the run-key rule (lib/the-run-a-key-holds.ts), an agent its run acts for; or the office's key, which the
 * office's own processes send under their own names, as the message worker does on the runs it files. A call no
 * listener carried is the office's own code. While the key window is open a listener also carries a request that
 * only names an agent, and on a run's own facts that name alone is not taken.
 */
export function aKeyOrTheOfficesOwnCodeCarriesIt(actor: Actor): boolean {
  return actor.provedBy === 'an-agent-key' || actor.provedBy === 'the-office-key' || actor.from === undefined
}

/**
 * THE RECORD THE RECORD DOOR IS WRITING: the id PATCH /api/records/<id> or a revision's restore names, for the length
 * of that one write, and null at every other time. `patchRecord` asks who may change a run (`assertMayChangeARun`)
 * only of a write this names. The office's own sweeps write runs too, and some in a caller's name: discovery
 * (lib/sessions.ts) writes what it read off a run's transcript under the caller who asked for the sweep. That caller
 * did not change somebody's run; the office did.
 */
export let theRecordTheDoorWrites: string | null = null

/** Does one write as the record door's, for the record `id`. See `theRecordTheDoorWrites`. */
export function throughTheRecordDoor<T>(id: string, write: () => T): T {
  const outer = theRecordTheDoorWrites
  theRecordTheDoorWrites = id
  try {
    return write()
  } finally {
    theRecordTheDoorWrites = outer
  }
}

/** The handle of an agent a run's data names, or what the data holds when no registry row has that id. */
export function theHandleOfAStoredAgent(id: string): string {
  return (readParticipant({ kind: 'agent', id }) as RegisteredAgent | null)?.handle ?? id
}

/** The refusal of a write of a report's `answers` by anything but the answer door. */
export const ONLY_THE_ANSWER_DOOR_WRITES_ANSWERS =
  `A report's ${ANSWERS_FIELD} holds the person's answers to its questions, and only the answer door writes it, as the ` +
  'person answers in the report (PUT /api/records/<id>/answers/<block id> and POST /api/records/<id>/answers/send). A ' +
  `write may not set, change or drop it: send a whole data that carries ${ANSWERS_FIELD} unchanged, or a dataPatch ` +
  'that leaves it out. Nothing was stored.'

/**
 * WHAT THE QUESTIONS IN A REPORT NAME IS THERE.
 *
 * Two names in a question are read only when the person presses, and a name that answers to nothing then would leave
 * the person with an answer nobody can take. So the write that puts the name there is told at once:
 *   - a choice's `about` names a proposal or a decision in this project, by id, that is not deleted;
 *   - a box's or a button's `to` names an agent the office can resolve now, read as an arriving reference through the
 *     one resolver, which refuses a name two agents answer to and a retired agent's name on a write.
 *
 * `stored` is the report as it is stored, or null on a create. A name the stored report already carries in the same
 * place is not asked again, so a report can still be corrected after its proposal was deleted or its agent retired.
 */
export function refuseAQuestionThatNamesNothing(data: unknown, workspaceId: string, stored: unknown): void {
  const blocksOf = (body: unknown): SummaryBlock[] =>
    isJsonObject(body) && Array.isArray((body as Record<string, unknown>)['blocks'])
      ? ((body as Record<string, unknown>)['blocks'] as SummaryBlock[])
      : []
  const namesIn = (body: unknown): Set<string> => {
    const names = new Set<string>()
    for (const { block, box } of questionsIn(blocksOf(body))) {
      if (block.type === 'choice' && block.about !== undefined) names.add(`about ${block.id} ${block.about}`)
      if (block.type === 'button' && block.to !== undefined) names.add(`to ${block.id} ${block.to}`)
      if (box?.to !== undefined) names.add(`to ${box.id} ${box.to}`)
    }
    return names
  }
  const already = stored === null ? new Set<string>() : namesIn(stored)
  const asked = new Set<string>()
  for (const { block, box } of questionsIn(blocksOf(data))) {
    if (block.type === 'choice' && block.about !== undefined && !already.has(`about ${block.id} ${block.about}`)) {
      const about = block.about.trim()
      const record = getRecord(about)
      const why =
        record === null
          ? 'no record has that id'
          : record.deletedAt !== null
            ? `that ${kindWord(record.kind).text} ("${record.title}") was deleted`
            : record.workspaceId !== workspaceId
              ? `that ${kindWord(record.kind).text} ("${record.title}") is in another project`
              : record.kind !== PROPOSAL_KIND && record.kind !== DECISION_KIND
                ? `it is a ${kindWord(record.kind).text} ("${record.title}")`
                : null
      if (why !== null) {
        throw new PanelError(
          `Block "${block.id}" is a choice about "${about}", and ${why}. A choice's about names a proposal or a decision ` +
            'in this project, by id: the answer settles the proposal or replaces the decision. Name one, or leave about ' +
            'out. Nothing was stored.',
          400,
        )
      }
    }
    const named: { id: string; type: string; to: string }[] = []
    if (block.type === 'button' && block.to !== undefined) named.push({ id: block.id, type: 'button', to: block.to })
    if (box?.to !== undefined) named.push({ id: box.id, type: 'box', to: box.to })
    for (const one of named) {
      const key = `to ${one.id} ${one.to}`
      if (already.has(key) || asked.has(key)) continue
      asked.add(key)
      // THE ONE RESOLVER FOR AN ARRIVING NAME. It refuses, in its own words, a name two agents answer to and a write
      // that follows a retired agent's name. Null is nobody bearing the name at all.
      if (theAgentAnArrivingReferenceNames(one.to, 'writing') === null) {
        throw new PanelError(
          `Block "${one.id}" is a ${one.type} whose answers go to "${one.to}", and no agent in this office has that id ` +
            "or handle. Name a registered agent by its handle or its id, or leave to out to send the answers to the " +
            "report's writer. Nothing was stored.",
          400,
        )
      }
    }
  }
}

export function onlyItsDoorWritesThisVerdict(field: (typeof TOP_LEVEL_RUN_FIELDS_OF_THE_DOORS)[number]): string {
  return `Only ${THE_DOOR_OF[field]} writes ${field} on a run; an ordinary write may not set, change or drop it. Nothing was written.`
}

/**
 * WHETHER THE SENDER A MESSAGE CLAIMS IS ITS WRITER: the writer's own registry id, or, for an agent, a handle that
 * resolves to it (criterion I2). One reading for the create path and for a record that becomes a message.
 */
export function theClaimedSenderIsTheWriter(claimed: ParticipantRef, mine: ParticipantRef): boolean {
  if (claimed.kind !== mine.kind) return false
  const claimedAgent = claimed.kind === 'agent' ? theAgentAnArrivingReferenceNames(claimed.id, 'writing') : null
  return (claimedAgent === null ? claimed.id : claimedAgent.agent.id) === mine.id
}

/**
 * A RULE IS MARKED AS ONLY FOR THIS OFFICE BY THE PERSON'S OWN PRESS, AND BY NOTHING ELSE.
 * The person may mark a rule of a chapter record as belonging only to their own office, and the default
 * regulations a new office copies leave it out (src/shared/default-set.ts). The mark is `onlyThisOffice` on the chapter
 * record. Its one writer is `markARuleOnlyForThisOffice` in lib/office-regulations.ts, behind the person-only door
 * POST /api/office-regulations/only-this-office, which writes under `asTheOnlyThisOfficeDoor`. Every other write that
 * would set, change or drop it, on either path, is refused before anything is written; one that sends the stored value
 * back unchanged passes. Asked from `refuseAChineseHalfNotFromThisEnglish`, which both paths already ask of a record as
 * stored and as this write would leave it.
 */
let theOnlyThisOfficeDoorIsWriting = false

/** Run one write as the only-this-office door, the one writer of a chapter record's `onlyThisOffice`. */
export function asTheOnlyThisOfficeDoor<T>(write: () => T): T {
  const before = theOnlyThisOfficeDoorIsWriting
  theOnlyThisOfficeDoorIsWriting = true
  try {
    return write()
  } finally {
    theOnlyThisOfficeDoorIsWriting = before
  }
}

/**
 * A CHAPTER'S OUTLINE IS CHANGED BY THE PERSON, OR BY AN AGENT ON THE PERSON'S DECISION. A change to a
 * chapter's outline is a decision: every write that is not the person's own and changes the outline carries the
 * existing warrant, and the
 * message it cites is the authority_reference of a live decision of the owner's (`whichDecisionOfTheOwnersTheseWordsStandOn`
 * in lib/warrants.ts). The outline is `theOutlineOfAChapter` in @shared/office-rules.ts; it changes when a write files a
 * chapter, renumbers one, takes one out of its kind, or adds, removes, renames or reorders a rule. Asked on both paths,
 * so a restored revision and a raised secretary's applied change meet it too. The one write let through without either
 * is the office's own copy of the default chapters into a fresh office, under `asTheOfficesCopyOfTheDefaults`.
 * It also covers the office's own copy of the default flows (lib/default-flows.ts), and there it lets a create through
 * the flow step reasons check without stage reasons or sources.
 */
export let theOfficeIsCopyingItsDefaults = false

/** Run one write as the office's copy of the default chapters (lib/default-regulations.ts) or flows (lib/default-flows.ts), which needs no decision. */
export function asTheOfficesCopyOfTheDefaults<T>(write: () => T): T {
  const before = theOfficeIsCopyingItsDefaults
  theOfficeIsCopyingItsDefaults = true
  try {
    return write()
  } finally {
    theOfficeIsCopyingItsDefaults = before
  }
}

/** The sentence an agent's delete or restore of a chapter record meets. */
export const ONLY_THE_PERSON_DELETES_A_CHAPTER =
  'Only the person deletes a chapter record or brings one back, because either changes which rules the office reads. ' +
  'Nothing was written.'

export function refuseAChapterDeletedOrBroughtBackByAnAgent(row: { kind: string; data: unknown }, actor: Actor): void {
  if (chapterNumberOf(row.kind, row.data) === null || thePersonIsProved(actor)) return
  throw new PanelError(ONLY_THE_PERSON_DELETES_A_CHAPTER, 403)
}

/** The sentence a write meets when it would change the mark without the person's press. */
export const ONLY_THE_PERSONS_PRESS_MARKS_A_RULE =
  'Only the person marks a rule as only for this office, with the press on the regulations page ' +
  '(POST /api/office-regulations/only-this-office). An ordinary write may not set, change or drop onlyThisOffice. ' +
  'Nothing was written.'

function refuseAnOnlyThisOfficeMarkOutsideItsDoor(before: TheEnglishOfARecord | null, after: TheEnglishOfARecord): void {
  if (theOnlyThisOfficeDoorIsWriting) return
  const was = before !== null && isJsonObject(before.data) ? (before.data as Record<string, unknown>)['onlyThisOffice'] : undefined
  const is = isJsonObject(after.data) ? (after.data as Record<string, unknown>)['onlyThisOffice'] : undefined
  if (sameJson(was ?? null, is ?? null)) return
  throw new PanelError(ONLY_THE_PERSONS_PRESS_MARKS_A_RULE, 403)
}

/**
 * A MODULE'S `planning` IS WRITTEN BY THE PLANNING DOORS AND BY NOTHING ELSE.
 * It records that the plan step was done, that the plan was questioned, when, and the planner's answers, so a write that
 * could set it by hand would let a plan read as questioned when it was not. Its writer is lib/planning-flow.ts, under
 * `asThePlanningDoors`. Every other write that would set, change or drop it, on either path, is refused before anything
 * is written; one that sends the stored value back unchanged passes. Asked from `refuseAChineseHalfNotFromThisEnglish`,
 * as the only-this-office mark is.
 */
function refuseAPlanningOutsideItsDoors(before: TheEnglishOfARecord | null, after: TheEnglishOfARecord): void {
  if (thePlanningDoorsAreWriting()) return
  if (before?.kind !== 'module' && after.kind !== 'module') return
  const was = before !== null && isJsonObject(before.data) ? (before.data as Record<string, unknown>)['planning'] : undefined
  const is = isJsonObject(after.data) ? (after.data as Record<string, unknown>)['planning'] : undefined
  if (sameJson(was ?? null, is ?? null)) return
  throw new PanelError(
    "A module's planning is written only by the planning doors: POST /api/modules/<id>/plan-step-done, " +
      'POST /api/modules/<id>/plan, and a tick of the checklist item the planning flow put. An ordinary write may not set, ' +
      'change or drop planning. Nothing was written.',
    403,
    undefined,
    undefined,
    undefined,
    { code: 'planWrittenOutsideItsDoors', values: {} },
  )
}

/**
 * THE CHANGE-TOGETHER REFUSAL OF THE OFFICE REGULATIONS' CHINESE. A write that changes a chapter's or a
 * regulation's English, or a Chinese half, and leaves that half with a `from` that is not the hash of
 * the English after the write, is refused before anything is written. It names the field to set and
 * the hash its `from` must name. Which records are checked, and how, is `chineseNotFromThisEnglish`.
 */
export function refuseAChineseHalfNotFromThisEnglish(before: TheEnglishOfARecord | null, after: TheEnglishOfARecord): void {
  // The same two records answer the chapter record's other own-door rule, so it is asked here, on both paths.
  refuseAnOnlyThisOfficeMarkOutsideItsDoor(before, after)
  refuseAPlanningOutsideItsDoors(before, after)
  const wrong = chineseNotFromThisEnglish(before, after)
  if (wrong === null) return
  throw new PanelError(
    `This write would leave ${wrong.field} with a "from" that is not the hash of the English beside it, so nothing ` +
      `would show that the Chinese was written from this English. Set ${wrong.field} in the same write, translated from ` +
      `the English this write leaves, with "from": "${wrong.hash}". Nothing was written. The office's own languages ` +
      'change together; src/shared/english-hash.ts says how the hash is made.',

    400,
    undefined,
    undefined,
    undefined,
    { code: 'chineseHalfNotFromThisEnglish', values: {} },
  )
}

export const A_NOTICE_IS_THE_OFFICES =
  'Mole Office wrote this message, and nobody may change or delete it. Nothing was written. A notice says what the ' +
  'office did, and a changed one would say something that did not happen. A recipient marks it read with ' +
  'POST /api/messages/<id>/mark.'

/** Why somebody other than its writer may not change, delete or bring back a message. */
export function onlyItsWriterChangesAMessage(id: string, nobodyRecorded: boolean, act: 'change' | 'delete' | 'bring back'): string {
  return (
    `Only the writer of a message may ${act} it, and this request does not come from its writer. Nothing was written. ` +
    (nobodyRecorded ? 'Nobody recorded who wrote this message, so nobody can be shown to be its writer. ' : '') +
    `A recipient marks it read with POST /api/messages/${id}/mark. To answer it, write a new message.`
  )
}

/**
 * A REQUEST THAT WAITS FOR THE PERSON IS DELETED BY THE PERSON ONLY. A role request is an agent
 * asking for a card, and the one it asks is in `answersTo`. Where that is the person, an agent's delete would take the
 * request off the person's list before they saw it, which is what the answer door exists to prevent.
 * Confirmed on a test office on 5 October 2026: the asker, another agent, an agent nobody registered and a secretary they
 * raised each deleted one. A raise does not carry deletion: a raised secretary may answer such a
 * request, and an answer is kept on the request, where a delete is not an answer.
 */
export function refuseADeleteOfARequestThatWaitsForThePerson(record: { id: string; kind: string; data: unknown }, actor: Actor): void {
  if (record.kind !== 'role_request' || !isJsonObject(record.data)) return
  const answersTo = record.data['answersTo']
  if (!isJsonObject(answersTo) || answersTo['kind'] !== 'person') return
  if (thePersonIsProved(actor)) return
  throw new PanelError(
    `Request ${record.id} waits for the person: it asks them for a card, and only they may delete it. Nothing was ` +
      `written. To answer it for them, a secretary they raised presses POST /api/roles/requests/${record.id}/grant or ` +
      '/refuse, and the answer is kept on the request.',
    403,
  )
}

/**
 * HOW MANY WRITES ARE THE ROLE REQUEST DOOR'S OWN. Opened only by `asTheRoleRequestDoor`, and closed in a `finally`.
 */
export let theRoleRequestDoorIsWriting = 0

/**
 * THE ROLE REQUEST DOOR'S WRITE: THE ANSWER ON A REQUEST: the press that grants or refuses it, the new-key rule's writes, and the
 * asker's withdrawal. Each checks who presses before it calls this. Only inside it may a write
 * change a request's answer or who it answers to.
 */
export function asTheRoleRequestDoor<T>(write: () => T): T {
  theRoleRequestDoorIsWriting += 1
  try {
    return write()
  } finally {
    theRoleRequestDoorIsWriting -= 1
  }
}

/**
 * EVERY OPEN PAGE IS TOLD WHEN A REQUEST THAT WAITS FOR THE PERSON IS FILED OR CHANGED, by its answer, its withdrawal
 * or its words. GET /api/waiting lists every such request (source 5 in src/server/lib/waiting.ts), and a page reads
 * that list again at once only when it hears `needsYou` named (src/web/components/OnePress.tsx). Without this, a
 * session that registered itself reached Home only at Home's minute re-read or at a page change, and the guide's admit
 * step found no row. One announcement for the write, whichever of its versions waits.
 */
export function tellThePagesWhenARequestWaitsForThePerson(...versions: readonly { kind: string; data: unknown }[]): void {
  const waits = versions.some(({ kind, data }) => {
    if (kind !== 'role_request' || !isJsonObject(data)) return false
    const answersTo = data['answersTo']
    return isJsonObject(answersTo) && answersTo['kind'] === 'person'
  })
  if (!waits) return
  announce({
    name: 'list.changed',
    workspaceId: null,
    lists: ['needsYou'],
    about: null,
    groupId: null,
    because: 'A request that waits for the person was filed, answered or withdrawn.',
  })
}

/**
 * WHETHER A WRITE SAYS A RUN IS FINISHED, AND WHETHER A VERDICT ALREADY CLOSED THE RUN. `patchRecord` seals on it, and
 * the record door reads it to remind a run before its seal (lib/before-the-seal.ts), so the two cannot disagree about
 * which write seals (invariant 9). A write seals when `explicitlyFinishes` holds and `aVerdictClosedIt` is undefined.
 */
export function whetherThisWriteFinishesTheRun(
  before: { kind: string; data: unknown },
  patch: Pick<RecordPatch, 'data' | 'dataPatch'>,
): {
  finishingBody: Record<string, unknown> | undefined
  explicitlyFinishes: boolean
  aVerdictClosedIt: 'released' | 'confirmed' | undefined
} {
  const finishingBody =
    patch.dataPatch && aRunSaysItIsFinished(patch.dataPatch)
      ? patch.dataPatch
      : patch.data && aRunSaysItIsFinished(patch.data)
        ? patch.data
        : undefined
  const onlyItsCloseSaysIt = finishingBody !== undefined && !FINISHED_STATES.includes(String(finishingBody['state'] ?? ''))
  const itAlreadySaidIt = isJsonObject(before.data) && aRunSaysItIsFinished(before.data as Record<string, unknown>)
  const explicitlyFinishes = finishingBody !== undefined && !(onlyItsCloseSaysIt && itAlreadySaidIt)
  /**
   * A RUN A CHECK HAS RELEASED, OR A CONFIRM HAS CLOSED, IS NOT SEALED AGAIN.
   *
   * A run is released once, and a release names the seal it read. A write that says the run is
   * finished again used to mint a new seal and move `sealedTip`, and nothing asked a check of it: the release then named
   * a seal that was no longer the run's, and the merge queue refused the run. The message worker writes
   * `state: finished` when a run's process ends, so this happened to a run whose check released it before its process
   * stopped.
   *
   * So on such a run a write that says it is finished seals nothing; its other fields are stored as usual. And a write
   * that names a tip other than the commit the run was sealed on is refused before anything is written: that is new
   * work, and it goes in under a new run, as the merge queue already tells a released run.
   */
  const aVerdictClosedIt = (['released', 'confirmed'] as const).find(
    (field) =>
      before.kind === 'session' && isJsonObject(before.data) && (before.data as Record<string, unknown>)[field] != null,
  )
  return { finishingBody, explicitlyFinishes, aVerdictClosedIt }
}

/**
 * WHO MAY DELETE A MESSAGE OR BRING ONE BACK: its writer, and never a notice from the office.
 * A soft delete takes the message from everybody it was given to, which is a change to it,
 * so a recipient or a stranger may not make one. It is not a change of the words: the record and every
 * revision are kept, and its writer may bring it back. So the edit window does not apply to it.
 */
export function refuseADeleteOfAMessageByAnyoneButItsWriter(record: { id: string; kind: string; data: unknown }, actor: Actor, act: 'delete' | 'bring back'): void {
  if (record.kind !== 'message') return
  const sender = refFrom(isJsonObject(record.data) ? record.data['sentBy'] : undefined)
  if (sender !== null && isMoleOffice(sender)) {
    throw new PanelError(A_NOTICE_IS_THE_OFFICES, 403, undefined, undefined, 'Nobody may change a notice from Mole Office.', {
      code: 'messageIsTheOfficesNotice',
      values: {},
    })
  }
  const mine = participantForActor(actor)
  const notTheWriters = () =>
    new PanelError(onlyItsWriterChangesAMessage(record.id, sender === null, act), 403, undefined, undefined, 'Only its writer may change this message.', {
      code: 'messageNotYourWords',
      values: {},
    })
  if (sender === null || mine === null) throw notTheWriters()
  if (!theClaimedSenderIsTheWriter(sender, mine)) {
    const met = () => gateMet('who-deletes-a-message')
    if (gatePosition('who-deletes-a-message') === 'block') throw gateMetOnceTheWriteIsTakenBack(notTheWriters(), met)
    met()
  }
}

/** The `state` a write leaves on a record: the one its `dataPatch` sends, its whole `data`'s, or the stored one. */
export function theStateAWriteLeaves(storedState: unknown, patch: RecordPatch): unknown {
  return patch.dataPatch !== undefined && Object.hasOwn(patch.dataPatch, 'state')
    ? patch.dataPatch['state']
    : patch.data !== undefined && patch.data !== null
      ? patch.data['state']
      : storedState
}

/**
 * WHERE A GOVERNANCE ACT MAY BE ASKED FROM, which is the half of the rule the actor cannot answer.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE ACTOR IS NOT ENOUGH
 * ---------------------------------------------------------------------------------------
 *
 * `actorFrom` builds the actor out of headers, and a header is the caller's word for itself. So
 * `x-mole-office-actor-type: human` is a claim, not a finding, and until this clause existed it was a
 * claim nothing tested: anything that could reach the server and typed the word `human` could write
 * a decision, settle a fork or empty the queue. That is why `design/round-ten/design/remote-access.md`
 * §6.1 states the rule as an AND — an act is allowed when the ACTOR may perform it and the MACHINE
 * it was asked from may perform it — and `actor.from` is the second half.
 *
 * `actor.from` is the one thing on an `Actor` that is measured rather than said. It is written by
 * the listener that accepted the connection, before Fastify routes anything, and read by
 * `arrivalOf`. A caller cannot reach it.
 *
 * ---------------------------------------------------------------------------------------
 * IT REFUSES AN ACT, AND IT DOES NOT DEMOTE A PERSON
 * ---------------------------------------------------------------------------------------
 *
 * The owner at their other machine is still a person, their writes are still attributed to them, and
 * every ordinary write they make from there goes through untouched. Remote-access §2 says it in one
 * line: being remote is a permission and not an audience, and there is no fourth reader. What is
 * refused is a small, named set of acts — the ones the product already reserves to the person —
 * asked from a machine that is not the one Mole Office runs on. Nothing here reads a kind that is not
 * already human-only, and nothing here changes what anybody is told they are.
 *
 * ---------------------------------------------------------------------------------------
 * ABSENT MEANS THE RULE DOES NOT APPLY
 * ---------------------------------------------------------------------------------------
 *
 * `actor.from` is `undefined` for an in-process caller — a migration, a script, `app.inject()` in a
 * test — which was on no socket, so no listener saw it and there is no machine to name. That is the
 * same shape `stated` has and it is read the same way. It is deliberately NOT read as
 * `this machine`: a request that DID come in on a socket and was stamped by nobody is refused
 * before any of this, by `refuseAnUnclassifiedDoor` in lib/http.ts, with a 500 saying Mole Office cannot
 * tell which door it came through.
 */
export const ARRIVAL_IS_NOT_A_CLAIM =
  `Reaching Mole Office from another machine is not the same as sitting at it. Which machine asked is read from ` +
  `the connection itself, and nothing a request says can change it.`

/** The wire half of an arrival refusal: what was asked, what was measured, and what was not. */
export function arrivalDetail(what: string): string {
  return (
    `${what} · arrival: another machine · which machine asked is written by the listener that accepted the ` +
    `connection (stampArrival, src/server/index.ts) and read by arrivalOf; no header sets it. Mole Office cannot say ` +
    `WHICH other machine — naming the client is a separate reading and it is not built.`
  )
}

/**
 * WHO IS ASKING, WHEN THE ANSWER MATTERS — the half of the rule the caller cannot be trusted with.
 *
 * ---------------------------------------------------------------------------------------
 * THE HOLE THIS CLOSES, IN THE WORDS THAT MEASURED IT
 * ---------------------------------------------------------------------------------------
 *
 * `design/round-ten/design/settings-and-governance.md` §8.11: *"the hole is not the missing header.
 * It is the present one: any caller that sends x-mole-office-actor-type: human with any id is a stated
 * human and is refused nothing in §8"*. Every clause before this one reads `actor.type` and
 * `actor.stated`, and both of those are the caller's own word for itself. So anything that could
 * reach the port and type the word `human` was a person as far as records.ts was concerned, whatever
 * name it gave. Measured over real HTTP against a copy of the corpus at this commit's parent, with
 * a header and an invented name as the whole credential: a human claim with an invented id wrote a decision
 * (201), settled a fork with a `derived_from` link (201) and deleted an unsettled proposal (200).
 *
 * §8.11 item 1 says what is needed — *"An identity the server established, not one the caller
 * declared"* — and `remote-access.md` §6.1 states the rule as an AND: the ACTOR may perform the act
 * and the MACHINE it was asked from may perform it. `actor.from` is the machine half and it was
 * built first. This is the actor half, and it is the narrowest thing that is true.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT MOLE OFFICE CAN ESTABLISH ABOUT A PERSON, WHICH IS ONE THING
 * ---------------------------------------------------------------------------------------
 *
 * Mole Office is one person's diary on one machine, it has no login, and the identity it holds is
 * `HUMAN` — the name it writes on a request that names nobody at all (`actorFrom` in lib/http.ts,
 * and the name `refusePartialIdentity` quotes back when it says what it would have invented). That
 * name is the server's own and no header reaches it. So there is exactly one person Mole Office can
 * place, and a governance act asked in any other name is asked by somebody it has never heard of.
 *
 * IT IS NOT A NEW LIST AND MUST NOT BECOME ONE. `HUMAN` is read, not copied: a second place saying
 * who the person is would be one fact in two files with nothing making them agree, which is this
 * repository's own named defect and the worst possible thing to do to an authority rule.
 *
 * THAT SENTENCE WAS TRUE OF THIS FILE AND FALSE OF THE PRODUCT, AND A VERIFIER FOUND IT ON 25
 * AUGUST 2026. The browser wrote the same name again as `DEFAULT_ACTOR` in src/web/api.ts, and a
 * third time in the actor picker in src/web/components/Sidebar.tsx. Those two, not `HUMAN`, decided
 * whether the owner got through this door. Changing the browser's copy alone turned seven tests red
 * and not one of them was about authority. The name is declared once now, in `@shared/person.ts` as
 * `THE_PERSON`, and `HUMAN` reads it like every other place does.
 * tests/the-browser-and-the-server-mean-the-same-person.test.ts is what fails when a second copy
 * comes back, in either direction and on its own.
 *
 * ---------------------------------------------------------------------------------------
 * THIS IS A NARROWING AND NOT A PROOF, AND SAYING SO IS PART OF THE RULE
 * ---------------------------------------------------------------------------------------
 *
 * It takes the door from *any name at all* down to *one name*. A caller that sends the person's own
 * name from this machine is still not told apart from the person: the id is on every row of the change log,
 * it is in the refusals the write guards already write, and it is not a secret. Nothing here pretends it
 * is one. Closing that last step needs something the browser at this machine holds and a shell on it
 * does not, and neither design settles what that should be — so it is a fork, filed as a proposal in
 * the governance queue rather than decided here, and the acts stay refused to every invented name in
 * the meantime.
 *
 * ---------------------------------------------------------------------------------------
 * ABSENT MEANS THE RULE DOES NOT APPLY — the shape `stated` and `from` already have
 * ---------------------------------------------------------------------------------------
 *
 * `actor.from` is undefined for a caller no listener saw: a migration, a script, `app.inject()` in a
 * test. None of those made a claim through a header, so there is no claim to check, and reading them
 * as strangers would refuse the whole suite and every migration — the same mistake as reading an
 * unstamped arrival as `this machine`, made in the other direction. A request that DID arrive on a
 * socket and was stamped by nobody never gets this far: `refuseAnUnclassifiedDoor` in lib/http.ts
 * answers it 500 first, and says the fault is Mole Office's.
 *
 * IT IS ASKED WITH THE ACTOR CLAUSES AND BEFORE THE ARRIVAL ONE, for the reason written above each of those
 * in records.ts: it is true from any machine, so its advice is worth giving wherever the caller is.
 */
export function isSomebodyMoleOfficeCannotPlace(actor: Actor): boolean {
  // A caller that says it is not a person has already been refused by the clause before this one in records.ts, in
  // words that tell an agent what to file instead. Answering it here as well would replace that advice
  // with a worse one, which is the failure mode this whole rule is most likely to have.
  if (actor.type !== 'human') return false
  // NO DOOR, NO CLAIM. See "absent means the rule does not apply" above.
  if (actor.from === undefined) return false
  return actor.id !== HUMAN.id
}

/**
 * The sentence all three refusals end on. Written once because it is the RULE and not the act:
 * three copies of it would be three sentences that could come to disagree about what the rule is.
 */
export const ONE_PERSON_AND_THE_NAME_IS_ITS_OWN =
  `Mole Office is for one person, and the name it has for them is its own: the name Mole Office writes when a ` +
  `request carries no name. A request that hands it a different name is asking to be taken at its word, and a ` +
  `governance act is where Mole Office stops doing that. If you are an agent, file the fork; the answer is the ` +
  `person's. If you are the person, this is done in the browser at the machine Mole Office runs on.`

/** The wire half: what was asked, what name it was asked in, and where that name is not read from. */
export function strangerDetail(what: string, actor: Actor): string {
  return (
    `${what} · claimed: ${actor.type} "${actor.id}" · the person's identity is held by the server: it is the ` +
    `identity actorFrom fills in for a request carrying no actor header, and no header reaches it. Mole Office has ` +
    `no way to place "${actor.id}", so it is only a name. This narrows the act to one name; it does not prove the ` +
    `caller is that person.`
  )
}
