// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * CHECKLISTS: THE DOORS' WORK, THE READINGS, AND THE REMINDER THAT FIRES.
 *
 * This follows a decision on proposal XEFZwmSBw8xQ.
 * src/shared/checklists.ts holds the states, the rules every
 * write path meets,
 * and the one sentence about open items. This file holds what needs the database:
 *
 *   - who the owner is, written from the caller and never from a body, or the person when a secretary asks;
 *   - that every id an item names is a record that is there, and of the right kind;
 *   - which checklists a read returns: the caller's own unless another owner is named;
 *   - that only the owner switches an item's reminder, and that it fires once, to the owner alone;
 *   - an owner's open items, for the brief and the reminders;
 *   - who added each item, the person's own "done" with no evidence, and the one message that tells the agents an item
 *     names, in wave 13j round loop-5.
 *
 * EVERY DOOR CHECKS EVERYTHING BEFORE IT WRITES ANYTHING, and then writes once, inside the checklist
 * doors' mark (lib/checklist-door.ts) that `assertMayWrite` in lib/records/may-write.ts asks for.
 */

import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'

import {
  CHECKLIST_KIND,
  CHECKLIST_ITEM_STYLES,
  CLOSED_ITEM_STATES,
  CHECKLIST_ITEM_STATES,
  EVIDENCE_KINDS,
  EVIDENCE_RECORD_KIND,
  WAITING_ON_THE_OWNER,
  checklistCounts,
  isClosed,
  isOpenWork,
  theOpenItemsSentence,
  type ChecklistDoneByThePerson,
  type ChecklistEvidence,
  type ChecklistLinked,
  type ChecklistNamed,
  type ChecklistPress,
  type ChecklistReading,
  type ChecklistRequest,
  type OpenItems,
} from '@shared/checklists.ts'
import { SYSTEM_LINES, type AnOfficeLine } from '@shared/groups.ts'
import { blocksFieldOf } from '@shared/kinds.ts'
import { moleOffice, isMoleOffice, participantWord, type ParticipantRef } from '@shared/participants.ts'
import { piecesOfBody, sameParticipant } from '@shared/messages.ts'
import { NOBODY_HAS_SAID, THE_PERSON } from '@shared/person.ts'
import { localStamp, parseLocalStamp, readATypedTime } from '@shared/time.ts'
import { kindWord } from '@shared/words.ts'
import type { PanelRecord } from '@shared/types.ts'
import { db, sqlite } from '../db/client.ts'
import { records } from '../db/schema.ts'
import { asTheChecklistDoors } from './checklist-door.ts'
import { aBlockName, type NamedBlock } from '@shared/block-name.ts'
import { gateMet, gateMetOnceTheWriteIsTakenBack } from './gate-counts.ts'
import { anAgentItsOwnKeyProves, refusedWhileTheGateIsOff } from './who-may-act.ts'
import { gatePosition } from '../../config/settings.mjs'
import { nameOf, writeASystemLineToAgents, writeASystemLineToOne } from './groups.ts'
import { nothingWrittenSentence } from './records/patching.ts'
import { theMessageReader, theMessagesThisReaderMayRead } from './messages.ts'
import { participantForActor } from './participant-for-actor.ts'
import { theAgentAnArrivingReferenceNames } from './the-agent-an-arriving-reference-names.ts'
import { theKeyProvesASecretary } from './the-key-proves-a-secretary.ts'
import { anItemOfAFlowChangedByHand, theFlowsOnAChecklist } from './entered-flows.ts'
import {
  aRaiseCarriesIt,
  createRecordWithReport,
  getRecord,
  patchRecord,
  recordInWorkspace,
  thePressUnderTheGrantOf,
  toRecord,
  type Actor,
} from './records.ts'
import { theReasonsOfThePresses } from '../db/the-reasons-of-the-presses.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { PanelError } from './panel-error.ts'
import { whoseRecordsAreThese } from './the-persons-own-words.ts'
import { versionOf } from './version.ts'
import { writeShortForms } from './zoom.ts'

function theOffice(): Actor { return { type: 'system', id: moleOffice().id } }
// ============================================================================ what a body may say

const A_LABEL = z.string().trim().min(1).max(80)

const EVIDENCE = z
  .object({
    kind: z.enum(EVIDENCE_KINDS),
    commit: z.string().trim().min(1).optional(),
    record: z.string().trim().min(1).optional(),
    block: z.string().trim().min(1).optional(),
  })
  .strict()

const LINKS = z.array(z.string().trim().min(1))

/**
 * THE AGENTS TO TELL WHEN THE PERSON MARKS THE ITEM DONE, in place of whoever added it or beside it (put the adder in the
 * list too). Each one an agent's id or handle, with or without "agent:". The office stores each as the agent it names.
 */
const TELL = z.array(z.string().trim().min(1)).min(1)

/** One new item. Its id, its reminder and who added it are the office's to write. */
export const A_NEW_ITEM = z
  .object({
    words: z.string().trim().min(1),
    fromMessage: z.string().trim().min(1).optional(),
    state: z.enum(CHECKLIST_ITEM_STATES).optional(),
    // THE STYLE THE CREATING AGENT CHOOSES: "plain" or "evidence-or-words".
    // Absent is stored as "plain"; a value outside the two is refused here, before anything is written.
    style: z.enum(CHECKLIST_ITEM_STYLES).optional(),
    mustBeInManual: z.boolean().optional(),
    evidence: z.array(EVIDENCE).optional(),
    supersededBy: z.string().trim().min(1).optional(),
    links: LINKS.optional(),
    tell: TELL.optional(),
    standing: z.boolean().optional(),
  })
  .strict()

/**
 * A new checklist. Its owner is the caller, written by the office, or the person when a secretary presses the door for
 * them: it sends `forThePerson` with its reason, which lib/for-the-person.ts takes off the body before this shape reads
 * it, so the shape does not name it and the door reads it on the caller's press. The reason is not stored: the owner it
 * names is.
 */
export const A_NEW_CHECKLIST = z
  .object({
    title: z.string().trim().min(1),
    items: z.array(A_NEW_ITEM).optional(),
    label: A_LABEL.optional(),
  })
  .strict()

/** A change to the checklist itself. */
export const A_CHECKLIST_CHANGE = z
  .object({
    title: z.string().trim().min(1).optional(),
    label: A_LABEL.optional(),
    ifVersion: z.string().min(1).optional(),
  })
  .strict()

/**
 * A change to one item: only the keys that change. `evidence` and `links` replace the item's list
 * whole; `addEvidence` and `addLinks` add to it. A null takes `fromMessage`, `supersededBy` or `tell` away, and
 * `standing: false` takes `standing` away: it is stored only as true.
 * `onThePersonsWords` names a message of the person's that the caller read as naming this item: sent with
 * `state: "done"`, it marks the item done on the person's own words, with no evidence.
 * `response` is the checklist owner's own written words, sent with the press that marks the item done and the
 * version it was read at. It is kept exactly as written, so whitespace is left alone; a blank is refused.
 */
export const AN_ITEM_CHANGE = z
  .object({
    words: z.string().trim().min(1).optional(),
    fromMessage: z.string().trim().min(1).nullable().optional(),
    state: z.enum(CHECKLIST_ITEM_STATES).optional(),
    mustBeInManual: z.boolean().optional(),
    evidence: z.array(EVIDENCE).optional(),
    addEvidence: z.array(EVIDENCE).optional(),
    supersededBy: z.string().trim().min(1).nullable().optional(),
    links: LINKS.optional(),
    addLinks: LINKS.optional(),
    tell: TELL.nullable().optional(),
    standing: z.boolean().optional(),
    onThePersonsWords: z.string().trim().min(1).optional(),
    response: z
      .string()
      .min(1)
      .refine((one) => one.trim() !== '', { message: 'response is blank, so there is nothing to keep. Leave the key out instead.' })
      .optional(),
    ifVersion: z.string().min(1).optional(),
  })
  .strict()

/** Switching an item's reminder on at one time, or off. */
export const A_REMINDER_SWITCH = z.union([
  z.object({ on: z.literal(true), at: z.string().trim().min(1) }).strict(),
  z.object({ on: z.literal(false) }).strict(),
])

// ============================================================================ the readings

/** One checklist as the doors return it. Declared in src/shared/checklists.ts, where the page reads it too. */
export type { ChecklistReading } from '@shared/checklists.ts'

function itemsOf(record: PanelRecord): ChecklistRequest[] {
  const items = (record.data as Record<string, unknown>)['items']
  return Array.isArray(items) ? (items as ChecklistRequest[]) : []
}

function ownerOf(record: PanelRecord): ParticipantRef {
  return (record.data as Record<string, unknown>)['owner'] as ParticipantRef
}

/** One checklist as the doors return it to this reader: a message's title is handed only to a reader who may read it. */
function readAChecklist(record: PanelRecord, reader: Actor, openItemsOnly = false): ChecklistReading {
  const items = itemsOf(record)
  const owner = ownerOf(record)
  const head = { id: record.id, workspaceId: record.workspaceId, title: record.title, owner, ownerName: nameOf(owner) }
  const tail = { version: versionOf(record), updatedAt: record.updatedAt }
  if (!openItemsOnly) {
    return {
      ...head,
      items,
      counts: checklistCounts(items),
      flows: theFlowsOnAChecklist(items),
      linked: theRecordsTheItemsName(items, reader),
      named: theParticipantsTheItemsName(items),
      presses: thePressesTheMarksName(items),
      ...tail,
    }
  }
  // ONLY THE ITEMS NOT FINISHED, WHEN THE LIST IS ASKED WITH items=open. Finished items are most of a checklist's bytes,
  // the page and the window draw them only when a fold is pressed, and reading the records only they name is most of
  // the time a list read takes. The counts are still worked out from every item, and each list below is the whole
  // reading's list cut to what the kept items name, so nothing a finished item names alone is read.
  // Measured on a made-up office: everybody's checklists in every project were 575,364 bytes, 375,905 of them finished items.
  const kept = items.filter((item) => !isClosed(item.state))
  return {
    ...head,
    items: kept,
    finishedItems: items.filter((item) => isClosed(item.state)).map((item) => (item.addedBy === undefined ? { id: item.id } : { id: item.id, addedBy: item.addedBy })),
    counts: checklistCounts(items),
    flows: theFlowsOnAChecklist(kept),
    linked: theRecordsTheItemsName(items, reader, kept),
    named: theParticipantsTheItemsName(items, kept),
    presses: thePressesTheMarksName(items, kept),
    ...tail,
  }
}

/**
 * EVERY RECORD THE ITEMS NAME, once each, with its title and the blocks named in it, as wave 13j round
 * 57 built it. The doors checked each id when it was written; this reads what it is
 * now. A message's title is
 * handed only to a reader who may read it, and to anybody else it is said as the item doors say
 * it: no message you may read has that id.
 *
 * AN ID WRITTEN ONLY IN AN ITEM'S WORDS is listed only when this reader may open what it names, so the row can draw it
 * as a link. Nobody wrote it as a link, so an id no record has, or a message the reader may not read, stays plain words
 * and is not listed. The words are split as the chat splits a message's body.
 */
function theRecordsTheItemsName(items: readonly ChecklistRequest[], reader: Actor, kept: readonly ChecklistRequest[] = items): ChecklistLinked[] {
  const named = new Map<string, Set<string>>()
  const name = (id: string, block: string | undefined): void => {
    const blocks = named.get(id) ?? new Set<string>()
    if (block !== undefined) blocks.add(block)
    named.set(id, blocks)
  }
  for (const item of items) {
    for (const id of item.links ?? []) name(id, undefined)
    for (const one of item.evidence ?? []) if (one.record !== undefined) name(one.record, one.block)
  }
  const onlyInTheWords = new Set<string>()
  for (const item of items) {
    for (const piece of piecesOfBody(item.words)) {
      if (piece.what !== 'record' || named.has(piece.recordId)) continue
      onlyInTheWords.add(piece.recordId)
      name(piece.recordId, undefined)
    }
  }
  // THE ORDER, THE BLOCKS AND WHAT IS ONLY IN THE WORDS ARE DECIDED ACROSS EVERY ITEM, before a record is read, so a
  // list cut to the kept items holds the same entries as the whole list, in the same order.
  const asked = kept === items ? null : theRecordIdsTheseItemsName(kept)
  const found = [...named.keys()].filter((id) => asked === null || asked.has(id)).map((id) => ({ id, record: getRecord(id) }))
  const messages = found.filter(({ record }) => record?.kind === 'message').map(({ id }) => id)
  const readable = messages.length === 0 ? new Set<string>() : theMessagesThisReaderMayRead(theMessageReader(reader), messages)
  return found.map(({ id, record }): ChecklistLinked => {
    if (record?.kind === 'message' && (record.deletedAt !== null || !readable.has(id))) return { id, found: false, because: 'no message you may read' }
    if (record === null || record.deletedAt !== null) return { id, found: false, because: 'no record' }
    const field = blocksFieldOf(record.kind)
    const held = field === null ? undefined : (record.data as Record<string, unknown>)[field]
    const blocks = (Array.isArray(held) ? held : []) as NamedBlock[]
    return {
      id,
      found: true,
      kind: record.kind,
      title: record.title,
      blocks: [...named.get(id)!].map((block) => {
        const one = blocks.find((each) => each.id === block)
        return { id: block, name: one === undefined ? null : aBlockName(one) }
      }),
    }
  }).filter((one) => one.found || !onlyInTheWords.has(one.id))
}

/** Every record id these items name: as a link, as evidence, or in their words. */
function theRecordIdsTheseItemsName(items: readonly ChecklistRequest[]): Set<string> {
  const ids = new Set<string>()
  for (const item of items) {
    for (const id of item.links ?? []) ids.add(id)
    for (const one of item.evidence ?? []) if (one.record !== undefined) ids.add(one.record)
    for (const piece of piecesOfBody(item.words)) if (piece.what === 'record') ids.add(piece.recordId)
  }
  return ids
}

/** The press each of these items' marks names. */
function thePressesOf(items: readonly ChecklistRequest[]): string[] {
  return items.flatMap((item) => (item.doneByThePerson?.press === undefined ? [] : [item.doneByThePerson.press]))
}

/**
 * EVERY PRESS UNDER THE GRANT A MARK NAMES, once each, with the reason its row holds. The reason is kept only in the press
 * row, so the checklist reads it there and stores no copy of it. A press with no row is left out.
 */
function thePressesTheMarksName(items: readonly ChecklistRequest[], kept: readonly ChecklistRequest[] = items): ChecklistPress[] {
  const asked = new Set(thePressesOf(kept))
  const named = [...new Set(thePressesOf(items))].filter((id) => asked.has(id))
  const reasons = theReasonsOfThePresses(named)
  return named.flatMap((id) => (reasons.has(id) ? [{ id, reason: reasons.get(id) ?? null }] : []))
}

/** EVERY PARTICIPANT THE ITEMS NAME, once each, with the name the registry holds for it: who added, who to tell, who marked and who was told. */
function theParticipantsTheItemsName(items: readonly ChecklistRequest[], kept: readonly ChecklistRequest[] = items): ChecklistNamed[] {
  const asked = theParticipantsOf(kept)
  return theParticipantsOf(items)
    .filter((who) => asked.some((one) => sameParticipant(one, who)))
    .map((who) => ({ who, name: nameOf(who) }))
}

/** Every participant these items name, once each, in the order they first appear. */
function theParticipantsOf(items: readonly ChecklistRequest[]): ParticipantRef[] {
  const named: ParticipantRef[] = []
  const name = (who: ParticipantRef | undefined): void => {
    if (who !== undefined && !named.some((one) => sameParticipant(one, who))) named.push(who)
  }
  for (const item of items) {
    name(item.addedBy)
    for (const who of item.tell ?? []) name(who)
    name(item.doneByThePerson?.by)
    for (const who of item.doneByThePerson?.told ?? []) name(who)
  }
  return named
}

/** The caller as the participant who owns what it makes, or a refusal that says why there is none. */
function theCallerOrARefusal(actor: Actor, doing: string): ParticipantRef {
  const me = participantForActor(actor)
  if (me === null) {
    throw new PanelError(
      `${doing} needs a caller this office holds a registry row for, because a checklist keeps whose it is. ` +
        `Nothing here answers to ${actor.type} "${actor.id}". Register with POST /api/agents/started, or send the ` +
        'request as a person or an agent the office knows. Nothing was written.',
      403,
    )
  }
  return me
}

/**
 * THE PERSON A SECRETARY MAKES A CHECKLIST FOR, which wave 13j settled in round 57.
 * A secretary serves
 * the office's one owner: the office keeps no person for each secretary, and `people.office_owner` holds exactly one row,
 * which lib/owner.ts reads into THE_PERSON. Only an agent whose own key proves the secretary card may ask; a header that
 * names a secretary proves nothing. Anybody else is refused, and nothing is written. The person never asks here:
 * lib/for-the-person.ts refuses a reason on the person's own request, and the person owns what they make as themself.
 */
function thePersonASecretaryMakesItFor(actor: Actor): ParticipantRef {
  const me = theCallerOrARefusal(actor, 'Making a checklist for the person')
  if (!theKeyProvesASecretary(actor) && gateMet('who-makes-a-checklist-for-the-person') === 'block') {
    throw new PanelError(
      'Only a secretary, proved by its own key, may make a checklist for the person with forThePerson. ' +
        `${nameOf(me)} is not proved to be a secretary. Leave forThePerson out to make the checklist as yourself. Nothing was written.`,
      403,
    )
  }
  if (THE_PERSON === NOBODY_HAS_SAID) {
    throw new PanelError('Nobody has said who owns this office yet, so there is no person to make the checklist for. Nothing was written.', 409)
  }
  return { kind: 'person', id: THE_PERSON }
}

/** One checklist in this project, or the refusal for an id that names none. */
function theChecklist(id: string, workspaceId: string): PanelRecord {
  const record = recordInWorkspace(id, workspaceId)
  if (record.kind !== CHECKLIST_KIND) {
    throw new PanelError(`${id} is not a checklist: it is a ${kindWord(record.kind).text}. Read your checklists with GET /api/checklists. Nothing was written.`, 409)
  }
  if (record.deletedAt !== null) throw new PanelError(`Checklist ${id} was deleted. Nothing was written.`, 404)
  return record
}

// ============================================================================ what an item names

/**
 * A MESSAGE THE CALLER MAY READ, or a refusal. A message the caller may not read is refused in the
 * same words as one that is not there, so the refusal says nothing about it.
 */
function assertAMessageTheCallerMayRead(id: string, actor: Actor, what: string): void {
  const record = getRecord(id)
  const readable = theMessagesThisReaderMayRead(theMessageReader(actor), [id]).has(id)
  if (record === null || record.kind !== 'message' || record.deletedAt !== null || !readable) {
    throw new PanelError(`${what} names ${id}, and there is no message with that id that you may read. Nothing was written.`, 404)
  }
}

/** A record that is there, and that a message among them is one the caller may read. */
function assertARecordThatIsThere(id: string, actor: Actor, what: string): PanelRecord {
  const record = getRecord(id)
  if (record === null || record.deletedAt !== null) {
    throw new PanelError(`${what} names ${id}, and no record has that id. Nothing was written.`, 404)
  }
  if (record.kind === 'message') assertAMessageTheCallerMayRead(id, actor, what)
  return record
}

/** One piece of evidence names a record of its kind, and a manual section a block that record holds. */
function assertTheEvidenceIsThere(one: ChecklistEvidence, actor: Actor, what: string): void {
  if (one.kind === 'commit' || one.record === undefined) return
  const record = assertARecordThatIsThere(one.record, actor, what)
  const kind = EVIDENCE_RECORD_KIND[one.kind]
  if (kind !== null && record.kind !== kind) {
    throw new PanelError(
      `${what} is a ${one.kind} and names ${one.record}, which is a ${kindWord(record.kind).text} and not a ${kindWord(kind).text}. Nothing was written.`,
      400,
    )
  }
  if (one.kind === 'manual section') {
    const field = blocksFieldOf(record.kind)
    const blocks = field === null ? null : (record.data as Record<string, unknown>)[field]
    const ids = Array.isArray(blocks) ? blocks.map((block) => (block as Record<string, unknown>)['id']) : []
    if (one.block === undefined || !ids.includes(one.block)) {
      throw new PanelError(
        `${what} is a manual section in ${one.record}, and that record holds no block with id "${String(one.block)}". ` +
          `${field === null ? `A ${kindWord(record.kind).text} holds no blocks.` : `Its blocks are ${ids.length === 0 ? 'none' : ids.map(String).join(', ')}.`} ` +
          'Nothing was written.',
        400,
      )
    }
  }
}

/** Every id one item names is checked before anything is written. */
function assertWhatTheItemNamesIsThere(item: Partial<ChecklistRequest>, actor: Actor, where: string): void {
  if (item.fromMessage !== undefined) assertAMessageTheCallerMayRead(item.fromMessage, actor, `${where}.fromMessage`)
  if (item.supersededBy !== undefined) assertAMessageTheCallerMayRead(item.supersededBy, actor, `${where}.supersededBy`)
  ;(item.links ?? []).forEach((id, at) => assertARecordThatIsThere(id, actor, `${where}.links[${String(at)}]`))
  ;(item.evidence ?? []).forEach((one, at) => assertTheEvidenceIsThere(one, actor, `${where}.evidence[${String(at)}]`))
}

/** The id the next item gets. Items are never taken out, so the highest number only grows. */
function theNextItemId(items: readonly ChecklistRequest[]): string {
  const highest = items.reduce((most, item) => Math.max(most, Number(/^i-(\d+)$/.exec(item.id)?.[1] ?? 0)), 0)
  return `i-${String(highest + 1)}`
}

/**
 * THE AGENTS A `tell` NAMES, each as the agent the registry resolves it to, once each. A person is refused: the person
 * is the one who marks the item, and the office's line to several reaches agents only (lib/groups.ts). A name nobody
 * bears is refused as not there. Asked before anything is written.
 */
function theAgentsToTell(said: readonly string[], where: string): ParticipantRef[] {
  const agents: ParticipantRef[] = []
  said.forEach((one, at) => {
    const kind = /^(agent|person):/.exec(one)?.[1]
    if (kind === 'person') {
      throw new PanelError(
        `${where}.tell[${String(at)}] names a person. An item names agents to tell, and only agents: the person is the one who marks it done. Nothing was written.`,
        400,
      )
    }
    const reference = kind === 'agent' ? one.slice('agent:'.length) : one
    const found = theAgentAnArrivingReferenceNames(reference, 'writing')
    if (found === null || isMoleOffice({ kind: 'agent', id: found.agent.id })) {
      throw new PanelError(`${where}.tell[${String(at)}] names "${one}", and no agent in this office answers to it. Nothing was written.`, 404)
    }
    const agent: ParticipantRef = { kind: 'agent', id: found.agent.id }
    if (!agents.some((each) => sameParticipant(each, agent))) agents.push(agent)
  })
  return agents
}

/**
 * WHO ADDED AN ITEM, as the office writes it from the caller and never from a body. Mole Office when the office adds one
 * (lib/entered-flows.ts). Absent for a caller the office holds no registry row for, which is "nobody recorded who".
 */
function whoAdds(actor: Actor): ParticipantRef | undefined {
  if (actor.type === 'system' && actor.id === moleOffice().id) return moleOffice()
  return participantForActor(actor) ?? undefined
}

/**
 * WHETHER A WRITE TO THIS CHECKLIST TELLS THE PERSON: the checklist belongs to a person, and the writer is not that
 * person, which two decisions lay down. The
 * person's own press and the person's own writes are
 * not told about themselves, because the page shows them the change at once.
 */
function theWriteTellsThePerson(owner: ParticipantRef, actor: Actor): boolean {
  if (owner.kind !== 'person') return false
  if (thePersonIsProved(actor)) return false
  const writer = participantForActor(actor)
  return writer === null || !sameParticipant(writer, owner)
}

/** A new item as it is stored: absent keys stay absent, the state is "open" unless said, and the style is "plain" unless the creating agent chose the other. */
function aStoredItem(id: string, said: z.output<typeof A_NEW_ITEM>, addedBy: ParticipantRef | undefined, where: string): ChecklistRequest {
  return {
    id,
    words: said.words,
    ...(said.fromMessage === undefined ? {} : { fromMessage: said.fromMessage }),
    state: said.state ?? 'open',
    style: said.style ?? 'plain',
    ...(said.mustBeInManual === undefined ? {} : { mustBeInManual: said.mustBeInManual }),
    ...(said.evidence === undefined ? {} : { evidence: said.evidence }),
    ...(said.supersededBy === undefined ? {} : { supersededBy: said.supersededBy }),
    ...(said.links === undefined ? {} : { links: said.links }),
    ...(addedBy === undefined ? {} : { addedBy }),
    ...(said.tell === undefined ? {} : { tell: theAgentsToTell(said.tell, where) }),
    ...(said.standing === true ? { standing: true as const } : {}),
  }
}

function writeTheLabel(recordId: string, workspaceId: string, label: string, actor: Actor) {
  const newest = sqlite
    .prepare('SELECT seq, content_hash AS contentHash FROM revisions WHERE record_id = ? ORDER BY seq DESC LIMIT 1')
    .get(recordId) as { seq: number; contentHash: string } | undefined
  if (newest === undefined) {
    throw new PanelError(`Checklist ${recordId} has no revision to write a label from. Nothing was written.`, 409)
  }
  return writeShortForms(recordId, workspaceId, { madeFrom: newest, forms: { label } }, actor)
}

// ============================================================================ the doors

/**
 * Make a checklist. The caller is its owner, except when the office makes one for somebody (`forOwner`): then the office
 * is the writer the change log names, and the owner is the one named. Two callers do that: lib/entered-flows.ts, for an
 * agent that enters a flow (the planning flow included) and has no checklist in the project (wave 13j round 51: the create
 * row used to name the planner's run), and lib/getting-started.ts, for the person of a new office. A secretary that
 * sends `forThePerson` with its reason makes one the person owns, and the change log names the secretary (round 57). The
 * reason is read on the caller's press, because the field is taken off the body before the door reads it.
 */
export function makeAChecklist(input: {
  workspaceId: string
  said: z.output<typeof A_NEW_CHECKLIST>
  actor: Actor
  forOwner?: ParticipantRef
}): ChecklistReading {
  const said = input.said
  const owner =
    input.forOwner ??
    (input.actor.press !== undefined && input.actor.press.reason !== null
      ? thePersonASecretaryMakesItFor(input.actor)
      : theCallerOrARefusal(input.actor, 'Making a checklist'))
  const addedBy = whoAdds(input.actor)
  const items = (said.items ?? []).map((one, at) => aStoredItem(`i-${String(at + 1)}`, one, addedBy, `items[${String(at)}]`))
  items.forEach((item, at) => assertWhatTheItemNamesIsThere(item, input.actor, `items[${String(at)}]`))
  theItemIdsAreOne(items)
  const made = asTheChecklistDoors(() =>
    sqlite.transaction(() => {
      const record = createRecordWithReport({
        kind: CHECKLIST_KIND,
        title: said.title,
        data: { owner, items },
        workspaceId: input.workspaceId,
        actor: input.actor,
      }).record
      if (said.label !== undefined) writeTheLabel(record.id, input.workspaceId, said.label, input.actor)
      // ONE LINE FOR THE WHOLE CHECKLIST, not one per item, and none for an empty one, as two
      // decisions say.
      if (items.length > 0 && theWriteTellsThePerson(owner, input.actor)) {
        writeASystemLineToOne(owner, input.workspaceId, SYSTEM_LINES.aChecklistWasMadeForYou(said.title, items.length), theOffice())
      }
      return record
    })(),
  )
  return readAChecklist(getRecord(made.id) ?? made, input.actor)
}

/** Which checklists a read asks for: the caller's own, one other owner's, or everyone's. */
export type WhoseChecklists = { mine: true } | { everyone: true } | { owner: ParticipantRef }

/**
 * WHOSE CHECKLISTS `?owner=` NAMES. Absent is the caller's own. `everyone` is every checklist in the
 * project. `agent:<id or handle>` and `person:<id>` name one owner.
 */
export function whoseChecklistsAreAsked(owner: string | undefined): WhoseChecklists {
  if (owner === undefined || owner === 'me') return { mine: true }
  if (owner === 'everyone') return { everyone: true }
  const m = /^(agent|person):(.+)$/.exec(owner)
  if (m === null) {
    throw new PanelError(
      `?owner=${owner} names nobody. Leave it out for your own checklists, or send ?owner=everyone, ` +
        '?owner=agent:<id or handle> or ?owner=person:<id>.',
      400,
    )
  }
  const kind = m[1] as 'agent' | 'person'
  const found = participantForActor({ type: kind === 'person' ? 'human' : 'agent', id: m[2] ?? '' })
  if (found === null) throw new PanelError(`?owner=${owner} names no ${participantWord(kind)} this office holds.`, 404)
  return { owner: found }
}

/** The owner a read asks for, or null for every owner. */
function theOwnerAsked(actor: Actor, whose: WhoseChecklists): ParticipantRef | null {
  let owner: ParticipantRef | null = null
  if ('mine' in whose) owner = theCallerOrARefusal(actor, 'Reading your own checklists')
  if ('owner' in whose) owner = whose.owner
  return owner
}

/**
 * THE LIVE CHECKLISTS OF THESE PROJECTS, OF THIS OWNER OR OF EVERY OWNER WHEN IT IS NULL, IN ONE STATEMENT. The owner's
 * kind and id are compared in the database, exactly as `sameParticipant` compares them, so no other owner's checklist is
 * handed to the server (decision OQR0WDVq0FkP). Every asked owner is a registry reference already, as
 * `participantForActor` gives it. Newest change first. Where two were changed at the same moment, the projects come in
 * the order given and then the newest row first, which is the order one read of each project in turn gave.
 */
function theLiveChecklistsOf(workspaceIds: readonly string[], owner: ParticipantRef | null): PanelRecord[] {
  const asked = JSON.stringify(workspaceIds)
  const theOwner = owner === null ? [] : [
    eq(sql`json_extract(${records.data}, '$.owner.kind')`, owner.kind),
    eq(sql`json_extract(${records.data}, '$.owner.id')`, owner.id),
  ]
  return db
    .select()
    .from(records)
    .where(and(sql`${records.workspaceId} in (select value from json_each(${asked}))`, eq(records.kind, CHECKLIST_KIND), isNull(records.deletedAt), ...theOwner))
    .orderBy(desc(records.updatedAt), sql`(select key from json_each(${asked}) where value = ${records.workspaceId})`, sql`rowid desc`)
    .all()
    .map(toRecord)
}

/**
 * THE CHECKLISTS OF SEVERAL PROJECTS, read in one statement, newest change first. The caller sorts them as it shows
 * them. No project asked reads nothing and refuses nothing, as asking each project in turn did.
 */
export function listChecklistsOfProjects(input: { workspaceIds: readonly string[]; actor: Actor; whose: WhoseChecklists; openItemsOnly?: boolean }): ChecklistReading[] {
  if (input.workspaceIds.length === 0) return []
  return theLiveChecklistsOf(input.workspaceIds, theOwnerAsked(input.actor, input.whose)).map((record) => readAChecklist(record, input.actor, input.openItemsOnly))
}

/** The checklists a read returns, and the sentence that says which they are. */
export function listChecklists(input: { workspaceId: string; actor: Actor; whose: WhoseChecklists; openItemsOnly?: boolean }): {
  checklists: ChecklistReading[]
  says: string
} {
  const owner = theOwnerAsked(input.actor, input.whose)
  const theirs = theLiveChecklistsOf([input.workspaceId], owner)
  // WAITING ON THE OWNER FIRST (point 5), then the newest change first.
  const checklists = theirs.map((record) => readAChecklist(record, input.actor, input.openItemsOnly)).sort((a, b) => Number(b.counts.waitingOnTheOwner > 0) - Number(a.counts.waitingOnTheOwner > 0))
  const whose = owner === null ? 'every checklist in this project' : 'mine' in input.whose ? 'your own checklists' : `the checklists of ${nameOf(owner)}`
  const says =
    checklists.length === 0
      ? `There are no checklists here: this read is ${whose}, and none is in this project.`
      : `${String(checklists.length)} checklist${checklists.length === 1 ? '' : 's'}: ${whose}. Those with an item waiting on the owner come first.`
  return {
    checklists,
    says: 'mine' in input.whose ? `${says} Send ?owner=everyone for every checklist in this project, or ?owner=agent:<id> for one owner's.` : says,
  }
}

/** One checklist, whoever owns it: an id names it, so it was asked for by name. */
export function readOneChecklist(input: { workspaceId: string; id: string; actor: Actor }): ChecklistReading {
  return readAChecklist(theChecklist(input.id, input.workspaceId), input.actor)
}

/** Change a checklist's title or its label. */
export function changeAChecklist(input: {
  workspaceId: string
  id: string
  said: z.output<typeof A_CHECKLIST_CHANGE>
  actor: Actor
}): { checklist: ChecklistReading; nothingWritten?: string } {
  const record = theChecklist(input.id, input.workspaceId)
  const said = input.said
  if (said.title === undefined && said.label === undefined) {
    throw new PanelError('The change names nothing to change: send title, label or both. Nothing was written.', 400)
  }
  const changed = asTheChecklistDoors(() =>
    sqlite.transaction(() => {
      const patched = said.title === undefined ? undefined : patchRecord(record.id, { title: said.title, ...(said.ifVersion === undefined ? {} : { ifVersion: said.ifVersion }) }, input.actor, {
        op: 'update',
        note: 'The checklist was renamed.',
      })
      const current = patched?.record ?? record
      const label = said.label === undefined ? undefined : writeTheLabel(current.id, input.workspaceId, said.label, input.actor)
      return { record: current, nothingWritten: (patched === undefined || patched.nothingWritten !== undefined) && (label === undefined || label.nothingWritten !== undefined) }
    })(),
  )
  return { checklist: readAChecklist(getRecord(changed.record.id) ?? changed.record, input.actor), ...(changed.nothingWritten ? { nothingWritten: nothingWrittenSentence({ kind: 'already-stored' }) } : {}) }
}

/**
 * NO TWO ITEMS OF ONE CHECKLIST SHARE AN ID: an item is changed and reminded by its id, so a second
 * one would make the first unreachable. The doors give every id, and only the doors write the kind,
 * so this is the one place that holds it (tests/an-id-names-one-thing.test.ts).
 */
function theItemIdsAreOne(items: readonly ChecklistRequest[]): void {
  const seen = new Set<string>()
  for (const item of items) {
    if (seen.has(item.id)) throw new PanelError(`Two items of one checklist would share the id ${item.id}. Nothing was written.`, 409)
    seen.add(item.id)
  }
}

/**
 * Write a checklist's items, once, as the checklist doors. A version the checklist no longer has is refused here with a
 * code, at the point in the order where `patchRecord` would refuse it without one, so a page's press can say it in the
 * page's language and read the checklist again (wave 13j round loop-8). The refusal is the gate
 * `writes-from-a-stale-copy`. At off the version goes on to `patchRecord`, which counts it there, so it is not counted
 * here as well (wave 13r round N).
 */
function writeTheItems(record: PanelRecord, items: ChecklistRequest[], actor: Actor, note: string, ifVersion?: string): PanelRecord {
  return writeTheItemsWithResult(record, items, actor, note, ifVersion).record
}

function writeTheItemsWithResult(record: PanelRecord, items: ChecklistRequest[], actor: Actor, note: string, ifVersion?: string): ReturnType<typeof patchRecord> {
  const now = versionOf(record)
  if (ifVersion !== undefined && ifVersion !== now && gatePosition('writes-from-a-stale-copy') === 'block') {
    throw gateMetOnceTheWriteIsTakenBack(new PanelError(
      `Checklist "${record.title}" has changed since you read it, so nothing was written. You sent ifVersion "${ifVersion}"; ` +
        `it is now "${now}". Read it again with GET /api/checklists/${record.id}, apply your change to what is there now, ` +
        'and send the version that read hands back.',
      409,
      undefined,
      undefined,
      undefined,
      { code: 'checklistChangedSinceRead', values: {} },
    ), () => gateMet('writes-from-a-stale-copy', 'block'))
  }
  theItemIdsAreOne(items)
  return asTheChecklistDoors(
    () => patchRecord(record.id, { dataPatch: { items }, ...(ifVersion === undefined ? {} : { ifVersion }) }, actor, { op: 'update', note }),
  )
}

/** Add one item. Its id is the office's. */
export function addAnItem(input: { workspaceId: string; id: string; said: z.output<typeof A_NEW_ITEM>; actor: Actor }): {
  checklist: ChecklistReading
  item: ChecklistRequest
} {
  const record = theChecklist(input.id, input.workspaceId)
  const items = itemsOf(record)
  const owner = ownerOf(record)
  const item = aStoredItem(theNextItemId(items), input.said, whoAdds(input.actor), 'The new item')
  assertWhatTheItemNamesIsThere(item, input.actor, 'The new item')
  // THE LINE IS WRITTEN IN THE SAME WRITE AS THE ITEM, so a refused write leaves no line saying it happened. An item
  // added already done or superseded still sends only the "Added" line.
  const line = theWriteTellsThePerson(owner, input.actor) ? SYSTEM_LINES.addedToYourChecklist(item.words) : null
  const written = sqlite.transaction(() => {
    const written = writeTheItems(record, [...items, item], input.actor, `Item ${item.id} was added.`)
    if (line !== null) writeASystemLineToOne(owner, input.workspaceId, line, theOffice())
    return written
  })()
  return { checklist: readAChecklist(written, input.actor), item }
}

/** HOW THE PERSON'S OWN "DONE" CAME: the person's press, the person's message a caller read, or a raise of the person's. */
interface ThePersonsDone {
  how: 'press' | 'words' | 'raise'
  by: ParticipantRef
  words?: string
}

const NOT_THE_PERSONS_BECAUSE: Record<string, string> = {
  agentsMessage: 'an agent sent it',
  wordsChanged: 'somebody other than the person changed its words',
  deleted: 'it was deleted',
  noRecord: 'no record has that id',
}

/**
 * WHETHER THIS CHANGE IS THE PERSON'S OWN "DONE", which needs no evidence. Asked only
 * of a change that makes the item done. Three ways, in this order:
 *
 *   - `onThePersonsWords` names a message the caller may read that is the person's own words, as
 *     `whoseRecordsAreThese` in lib/the-persons-own-words.ts reads them: the person sent it and nobody else changed it;
 *   - the caller is proved to be the person: `thePersonIsProved`, the press on the page;
 *   - the person's raise carries the act, asked last and only when nothing else allows the "done": no evidence, or an
 *     item that must be in the manual with no manual section, because a raise carries the person's
 *     acts.
 *
 * Null otherwise, and then an agent's "done" needs evidence, which the shape rule in src/shared/checklists.ts asks.
 */
function thePersonsOwnDone(after: ChecklistRequest, words: string | undefined, actor: Actor, where: string): ThePersonsDone | null {
  if (words !== undefined) {
    assertAMessageTheCallerMayRead(words, actor, `${where}.onThePersonsWords`)
    const whose = whoseRecordsAreThese([words]).get(words)
    if (whose === undefined || !whose.own) {
      const because = whose === undefined ? 'no record has that id' : (NOT_THE_PERSONS_BECAUSE[whose.because] ?? 'the person did not send it')
      throw new PanelError(
        `${where}.onThePersonsWords names message ${words}, and it is not the person's own words: ${because}. Only a message ` +
          'the person sent, in words nobody else changed, marks an item done with no evidence. Nothing was written.',
        403,
      )
    }
    return { how: 'words', by: theCallerOrARefusal(actor, "Marking an item done on the person's words"), words }
  }
  if (thePersonIsProved(actor)) return { how: 'press', by: participantForActor(actor) ?? { kind: 'person', id: THE_PERSON } }
  const evidence = after.evidence ?? []
  const needsThePerson = evidence.length === 0 || (after.mustBeInManual === true && !evidence.some((one) => one.kind === 'manual section'))
  if (needsThePerson && aRaiseCarriesIt(actor)) return { how: 'raise', by: theCallerOrARefusal(actor, "Marking an item done under the person's raise") }
  return null
}

/**
 * THE AGENTS TOLD WHEN THE PERSON MARKS AN ITEM DONE: the ones the item names to tell, or else whoever added it. Never
 * Mole Office, and never the agent that wrote the mark, which knows already.
 */
function theAgentsTold(item: ChecklistRequest, writer: ParticipantRef): ParticipantRef[] {
  const named = item.tell ?? (item.addedBy === undefined ? [] : [item.addedBy])
  return named.filter((who) => who.kind === 'agent' && !isMoleOffice(who) && !sameParticipant(who, writer))
}

/** One sentence for the reply: who was told, or why nobody was. True of each way the list above comes out empty. */
function whoWasToldInWords(item: ChecklistRequest, told: readonly ParticipantRef[], writer: ParticipantRef): string {
  const names = told.map((who) => nameOf(who))
  if (names.length > 0) return `The office told ${names.length === 1 ? names[0]! : `${names.slice(0, -1).join(', ')} and ${names.at(-1)!}`} in one message that it is done.`
  if (item.tell === undefined && item.addedBy === undefined) return 'Nobody recorded who added this item, and it names nobody to tell, so nobody was told.'
  if (item.tell === undefined && item.addedBy?.kind === 'person') return 'The person added this item, and it names nobody to tell, so nobody was told.'
  if (item.tell === undefined && item.addedBy !== undefined && isMoleOffice(item.addedBy)) return 'Mole Office added this item, and it names nobody to tell, so nobody was told.'
  return `The only agent to tell is ${nameOf(writer)}, which wrote the mark, so nobody was told.`
}

/** Change one item, by its id. Only the keys sent change. `told` is the reply's sentence about the person's own "done", when this change was one. */
export function changeAnItem(input: {
  workspaceId: string
  id: string
  itemId: string
  said: z.output<typeof AN_ITEM_CHANGE>
  actor: Actor
}): { checklist: ChecklistReading; item: ChecklistRequest; told?: string; nothingWritten?: string } {
  const record = theChecklist(input.id, input.workspaceId)
  const owner = ownerOf(record)
  const items = itemsOf(record)
  const at = items.findIndex((item) => item.id === input.itemId)
  const before = items[at]
  if (before === undefined) {
    throw new PanelError(
      `Checklist "${record.title}" has no item ${input.itemId}. Its items are ${items.length === 0 ? 'none' : items.map((item) => item.id).join(', ')}. Nothing was written.`,
      404,
    )
  }
  const { ifVersion, addEvidence, addLinks, onThePersonsWords, response, ...said } = input.said
  const becomesDone = said.state === 'done' && before.state !== 'done'
  if (onThePersonsWords !== undefined && !becomesDone) {
    throw new PanelError(
      `onThePersonsWords marks an item done on the person's words, so it is sent with state "done" to an item that is not done yet. Item ${before.id} is ${before.state}. Nothing was written.`,
      400,
    )
  }
  // THE OWNER'S OWN WORDS, from wave 14a round 1: only the checklist's own owner writes them, only in
  // the press that marks the item done, and only with the version the checklist had when it was
  // read.
  // Every refusal is checked, and nothing is written, before any part of the change is applied.
  if (response !== undefined) {
    const me = participantForActor(input.actor)
    if (me === null || !sameParticipant(me, owner)) {
      throw new PanelError(
        `Only the owner of checklist "${record.title}", ${participantWord(owner.kind)} ${nameOf(owner)}, writes their own words on an item, and only with the press that marks it done. Nothing was written.`,
        403,
        undefined,
        undefined,
        undefined,
        { code: 'checklistOwnWordsNotTheOwner', values: {} },
      )
    }
    if (!becomesDone) {
      throw new PanelError(
        `Item ${before.id} of checklist "${record.title}": the written response goes with the press that marks the item done, so send "state":"done" in the same change. Nothing was written.`,
        400,
        undefined,
        undefined,
        undefined,
        { code: 'checklistOwnWordsNeedTheDonePress', values: {} },
      )
    }
    if (ifVersion === undefined) {
      throw new PanelError(
        `Item ${before.id} of checklist "${record.title}": the written response goes with the version the checklist had when you read it, so send "ifVersion" in the same change. Nothing was written.`,
        400,
        undefined,
        undefined,
        undefined,
        { code: 'checklistOwnWordsNeedTheVersion', values: {} },
      )
    }
  }
  if (Object.keys(said).length === 0 && addEvidence === undefined && addLinks === undefined) {
    throw new PanelError('The change names nothing to change on the item. Nothing was written.', 400)
  }
  if (said.evidence !== undefined && addEvidence !== undefined) {
    throw new PanelError('Send evidence to replace the list or addEvidence to add to it, not both. Nothing was written.', 400)
  }
  if (said.links !== undefined && addLinks !== undefined) {
    throw new PanelError('Send links to replace the list or addLinks to add to it, not both. Nothing was written.', 400)
  }
  const after: ChecklistRequest = { ...before }
  if (said.words !== undefined) after.words = said.words
  if (said.state !== undefined) after.state = said.state
  if (response !== undefined) after.response = response
  if (said.mustBeInManual !== undefined) after.mustBeInManual = said.mustBeInManual
  if (said.fromMessage === null) delete after.fromMessage
  else if (said.fromMessage !== undefined) after.fromMessage = said.fromMessage
  if (said.supersededBy === null) delete after.supersededBy
  else if (said.supersededBy !== undefined) after.supersededBy = said.supersededBy
  const evidence = said.evidence ?? (addEvidence === undefined ? undefined : [...(before.evidence ?? []), ...addEvidence])
  if (evidence !== undefined) after.evidence = evidence
  const links = said.links ?? (addLinks === undefined ? undefined : [...(before.links ?? []), ...addLinks])
  if (links !== undefined) after.links = links
  if (said.tell === null) delete after.tell
  else if (said.tell !== undefined) after.tell = theAgentsToTell(said.tell, `Item ${before.id}`)
  if (said.standing === true) after.standing = true
  else if (said.standing === false) delete after.standing
  // THE PERSON'S MARK IS KEPT ONLY WHILE THE ITEM IS DONE: opened again, it is an item nobody has marked done. The
  // owner's own words came with that mark, so they go with it too.
  if (after.state !== 'done') {
    delete after.doneByThePerson
    delete after.response
  }
  // AN ITEM THAT STANDS FOR A FLOW, TICKED BY HAND, ENDS ITS FLOW IN THE SAME WRITE, and until
  // the flow ends only the person or the agent in it may change the item at all; a planning item keeps its planner's
  // rule. Asked before anything is written, of the item AS STORED, so a change that replaces its links cannot hide the
  // flow (round 52b); lib/entered-flows.ts says which items are such.
  const endsAFlow = anItemOfAFlowChangedByHand(record.id, before, after.state === 'done' && before.state !== 'done', input.actor)
  // ONLY WHAT THIS CHANGE NAMES IS CHECKED AGAINST THE DATABASE: what was there was checked when it was written.
  assertWhatTheItemNamesIsThere(
    {
      ...(said.fromMessage ? { fromMessage: said.fromMessage } : {}),
      ...(said.supersededBy ? { supersededBy: said.supersededBy } : {}),
      ...(said.links ?? addLinks ? { links: said.links ?? addLinks } : {}),
      ...(said.evidence ?? addEvidence ? { evidence: said.evidence ?? addEvidence } : {}),
    },
    input.actor,
    `Item ${before.id}`,
  )
  const thePersons = becomesDone ? thePersonsOwnDone(after, onThePersonsWords, input.actor, `Item ${before.id}`) : null
  const told = thePersons === null ? [] : theAgentsTold(after, thePersons.by)
  const note = said.state !== undefined && said.state !== before.state ? `Item ${before.id}: ${before.state} → ${said.state}.` : `Item ${before.id} was changed.`
  // ONE LINE PER WRITE, and the line is written inside the transaction below, under two
  // decisions. A change that marks done sends only
  // the done line, a change to superseded sends only the removed
  // line, and every other change says "Changed". A done on the person's words goes to the person beside that message,
  // even on somebody else's checklist. The person's own press sends the person nothing.
  const tellsThePerson = theWriteTellsThePerson(owner, input.actor)
  let theLine: AnOfficeLine | null = null
  let aboutThePersonsMessage: string | undefined
  if (thePersons?.how === 'words') {
    theLine = SYSTEM_LINES.markedDoneOnAChecklist(after.words, owner.kind === 'person' ? null : nameOf(owner))
    aboutThePersonsMessage = thePersons.words
  } else if (tellsThePerson) {
    theLine = becomesDone
      ? SYSTEM_LINES.markedDoneOnAChecklist(after.words, null)
      : before.state !== 'superseded' && after.state === 'superseded'
        ? SYSTEM_LINES.removedFromYourChecklist(after.words)
        : SYSTEM_LINES.changedOnYourChecklist(after.words)
  }
  const written = sqlite.transaction(() => {
    if (thePersons !== null) {
      // THE LINES ARE WRITTEN IN THE SAME WRITE AS THE MARK, so a refused write leaves no line saying it happened, and
      // the mark keeps the id of the one message that told the agents.
      const notice =
        told.length === 0
          ? undefined
          : writeASystemLineToAgents(
              told,
              input.workspaceId,
              SYSTEM_LINES.thePersonMarkedAnItemDone(record.title, before.id, after.words, nameOf(thePersons.by), thePersons.how, after.response),
              theOffice(),
            ).id
      // A MARK UNDER THE RAISE NAMES ITS PRESS, and the change log writes that press's row, with its reason, beside the
      // write below under the same id. The reason stays in the row alone.
      const press = thePersons.how === 'raise' ? thePressUnderTheGrantOf(input.actor) : undefined
      const mark: ChecklistDoneByThePerson = {
        at: localStamp(new Date()),
        by: thePersons.by,
        ...(thePersons.words === undefined ? {} : { onThePersonsWords: thePersons.words }),
        ...(thePersons.how === 'raise' ? { underTheRaise: true as const } : {}),
        ...(press === undefined ? {} : { press }),
        told,
        ...(notice === undefined ? {} : { notice }),
      }
      after.doneByThePerson = mark
    }
    if (theLine !== null) {
      writeASystemLineToOne(
        thePersons?.how === 'words' ? { kind: 'person', id: THE_PERSON } : owner,
        input.workspaceId,
        theLine,
        theOffice(),
        aboutThePersonsMessage === undefined ? undefined : { message: aboutThePersonsMessage },
      )
    }
    const next = items.map((item, i) => (i === at ? after : item))
    const written = writeTheItemsWithResult(record, next, input.actor, note, ifVersion)
    endsAFlow?.()
    return written
  })()
  if (thePersons === null) return { checklist: readAChecklist(written.record, input.actor), item: after, ...(written.nothingWritten !== undefined && theLine === null && endsAFlow == null ? { nothingWritten: nothingWrittenSentence({ kind: 'already-stored' }) } : {}) }
  const readAs =
    thePersons.words === undefined
      ? ''
      : ` The person's message ${thePersons.words} was read as naming this item, "${after.words}", and the office told the person so in one line beside that message.`
  return { checklist: readAChecklist(written.record, input.actor), item: after, told: `${whoWasToldInWords(after, told, thePersons.by)}${readAs}` }
}

/**
 * SWITCH ONE ITEM'S REMINDER ON AT A TIME, OR OFF. Only the checklist's owner may: the reminder fires
 * to the owner alone, and the decision gives the switch to the owner. While the gate
 * who-switches-a-checklist-reminder is off, an agent its own key proves may switch it too, and the
 * item names that agent as the one who switched it on (wave 13r round U). The reminder still fires to
 * the owner alone.
 */
export function switchTheReminder(input: {
  workspaceId: string
  id: string
  itemId: string
  said: z.output<typeof A_REMINDER_SWITCH>
  actor: Actor
  now?: Date
}): { checklist: ChecklistReading; item: ChecklistRequest } {
  const record = theChecklist(input.id, input.workspaceId)
  const owner = ownerOf(record)
  const me = participantForActor(input.actor)
  if (me === null || !sameParticipant(me, owner)) {
    const position = gatePosition('who-switches-a-checklist-reminder')
    const keyed = anAgentItsOwnKeyProves(input.actor) !== null
    if (!keyed && position !== 'block') {
      throw refusedWhileTheGateIsOff(input.actor.id, 'who-switches-a-checklist-reminder', "switch a reminder on another owner's checklist")
    }
    if (me === null || !keyed || gateMet('who-switches-a-checklist-reminder', position!) === 'block') {
      throw new PanelError(
        `Only the owner of checklist "${record.title}", ${participantWord(owner.kind)} ${nameOf(owner)}, switches its ` +
          'reminders, because a reminder fires to the owner alone. Nothing was written.',
        403,
      )
    }
  }
  const items = itemsOf(record)
  const at = items.findIndex((item) => item.id === input.itemId)
  const before = items[at]
  if (before === undefined) throw new PanelError(`Checklist "${record.title}" has no item ${input.itemId}. Nothing was written.`, 404)
  const after: ChecklistRequest = { ...before }
  let note: string
  if (input.said.on) {
    const when = readATypedTime(input.said.at)
    if (when === null) {
      throw new PanelError(`"${input.said.at}" is not a time: send it as YYYY-MM-DD HH:MM on the office computer's clock. Nothing was written.`, 400)
    }
    const now = localStamp(input.now ?? new Date())
    if (when <= now) {
      throw new PanelError(`${when} has passed: it is ${now} on the office computer's clock. Send a later time. Nothing was written.`, 400)
    }
    if (isClosed(before.state)) {
      throw new PanelError(`Item ${before.id} is ${before.state}, so there is nothing to remind anybody of. Nothing was written.`, 409)
    }
    after.reminder = { at: when, switchedOnBy: me }
    note = `Item ${before.id}: reminder on, at ${when}.`
  } else {
    if (before.reminder === undefined) throw new PanelError(`Item ${before.id} has no reminder on. Nothing was written.`, 409)
    delete after.reminder
    note = `Item ${before.id}: reminder off.`
  }
  const written = writeTheItems(record, items.map((item, i) => (i === at ? after : item)), input.actor, note)
  return { checklist: readAChecklist(written, input.actor), item: after }
}

// ============================================================================ bringing open items back

/** Every live checklist this owner has, in every project. */
function checklistsOwnedBy(owner: ParticipantRef): PanelRecord[] {
  return db
    .select()
    .from(records)
    .where(and(eq(records.kind, CHECKLIST_KIND), isNull(records.deletedAt)))
    .orderBy(desc(records.updatedAt), sql`rowid desc`)
    .all()
    .map((row) => getRecord(row.id))
    .filter((record): record is PanelRecord => record !== null && sameParticipant(ownerOf(record), owner))
}

/** One owner's open items, in every project. */
export function openItemsOf(owner: ParticipantRef): OpenItems {
  const items = checklistsOwnedBy(owner).flatMap(itemsOf)
  return {
    open: items.filter(isOpenWork).length,
    waitingOnTheOwner: items.filter((item) => isOpenWork(item) && item.state === WAITING_ON_THE_OWNER).map((item) => item.words),
  }
}

/**
 * EACH LIVE CHECKLIST THIS OWNER HAS, with how many of its items are open work, in every project, in the order
 * `checklistsOwnedBy` reads them. The office's message at a secretary's sleep time names the ones with many open items.
 */
export function openItemsByChecklistOf(owner: ParticipantRef): { id: string; title: string; open: number }[] {
  return checklistsOwnedBy(owner).map((record) => ({ id: record.id, title: record.title, open: itemsOf(record).filter(isOpenWork).length }))
}

/** The one sentence about an owner's open items, or null when there are none or no owner is known. */
export function theOpenItemsSentenceFor(owner: ParticipantRef | null): string | null {
  return owner === null ? null : theOpenItemsSentence(openItemsOf(owner))
}

/** The one sentence about a caller's open items, where the caller is a participant the office holds. */
export function theOpenItemsSentenceForTheCaller(actor: Actor): string | null {
  return theOpenItemsSentenceFor(participantForActor(actor))
}

/** One reminder that fired. */
export interface AChecklistReminderFired {
  checklist: string
  item: string
  to: ParticipantRef
  message: string
}

/**
 * EVERY ITEM REMINDER THAT IS DUE FIRES ONCE, TO THE CHECKLIST'S OWNER AND TO NOBODY ELSE. Run on the
 * office's minute tick (`sendTheRemindersThatAreDue` in lib/reminders.ts). A reminder is due when its
 * time has come, it has not fired, and its item is still open. The line and `firedAt` are one write.
 */
export function sendTheChecklistRemindersThatAreDue(now: Date): AChecklistReminderFired[] {
  const stamp = localStamp(now)
  const fired: AChecklistReminderFired[] = []
  const rows = db
    .select({ id: records.id })
    .from(records)
    .where(and(eq(records.kind, CHECKLIST_KIND), isNull(records.deletedAt)))
    .all()
  for (const row of rows) {
    const record = getRecord(row.id)
    if (record === null) continue
    const items = itemsOf(record)
    const due = items.filter((item) => {
      const reminder = item.reminder
      if (reminder === undefined || reminder.firedAt !== undefined || isClosed(item.state)) return false
      const at = parseLocalStamp(reminder.at)
      return at !== null && at <= now.getTime()
    })
    if (due.length === 0) continue
    const owner = ownerOf(record)
    sqlite.transaction(() => {
      const sent = due.map((item) => {
        const line = SYSTEM_LINES.aChecklistItemIsDue(record.title, item.id, item.words, item.state)
        return { item: item.id, message: writeASystemLineToOne(owner, record.workspaceId, line, theOffice()).id }
      })
      const dueIds = new Set(due.map((item) => item.id))
      const next = items.map((item) =>
        dueIds.has(item.id) && item.reminder !== undefined ? { ...item, reminder: { ...item.reminder, firedAt: stamp } } : item,
      )
      writeTheItems(record, next, theOffice(), `Reminder fired for ${due.map((item) => item.id).join(', ')}.`)
      for (const one of sent) fired.push({ checklist: record.id, item: one.item, to: owner, message: one.message })
    })()
  }
  return fired
}

/** The closed states, for a reader that needs to say which they are. */
export const THE_CLOSED_STATES = CLOSED_ITEM_STATES
