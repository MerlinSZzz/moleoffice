// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `readParticipant` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * `asAgent` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * `addressAsOf` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * `theParticipantByIdStatements` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * `PARTICIPANT_BY_ID` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * `ADDRESS_AS_COLUMN` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * `addressAsSetByOf` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * `asPerson` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * `citizenshipOf` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * `runtimeOfTheAgentRecord` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * `theStoredShortcuts` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * `whoSetIt` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * `theStoredMessageLabels` was moved out of src/server/lib/participants.ts; it now answers an unreadable stored
 * value as unreadable, with the reader's sentences, rather than as null.
 * `pathsOrNull` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * `safelyParsed` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * `whoTheRowSays` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { type ParticipantRef, isLanguage, isChatButtonStays, isChatOpensAs, isChatLayout, isChatTextSize, isCircleShows, isMessageLinkLayout, isMessageProjectMark, isSendKeySetting, isMessageLinkLevel, isPresenceChoice, readShortcutSettings, type ShortcutSettings, isParticipantKind } from '@shared/participants.ts'
import type { RegisteredAgent, RegisteredPerson, WhoAnAgentIs } from '../lib/participants.ts'
import { pixelScaleSchema } from '@shared/pixel-scale.ts'
import { pixelAppearanceSchema } from '@shared/pixel-office.ts'
import { readElevation, readElevations } from '@shared/read-elevations.ts'
import { theMarkSaying } from '@shared/roles.ts'
import { theAddressAsStored, type AddressAs, type AddressAsPart, type AddressAsSetBy } from '@shared/address-as.ts'
import { sqlite } from './client.ts'
import { circlePicture } from '@shared/messages.ts'
import { isMessagePictureChoice } from '@shared/messagepictures.ts'
import { isMediaLoadChoice } from '@shared/mediaload.ts'
import { theRuntimeOnTheNewestRecord } from './list-participants.ts'
import { theRuntimeForAgentStatement } from './the-model-on-the-agent-record.ts'
import { readMessageLabels, type TheStoredMessageLabels } from '@shared/message-label.ts'
import { readShippedFlags, type StoredShippedFlags } from '@shared/intent-mark.ts'
import { enWave13y } from '@shared/words/en-wave-13y.ts'
import { theRoleOnTheRow } from './the-role-on-the-agent-row.ts'

/** One participant, or null because no row answers to that kind and id. */
export function readParticipant(who: ParticipantRef): RegisteredPerson | RegisteredAgent | null {
  const statements = theParticipantByIdStatements()
  if (who.kind === 'person') {
    const row = statements.people.get(who.id) as Record<string, unknown> | undefined
    return row === undefined ? null : asPerson(row)
  }
  const row = statements.agents.get(who.id) as Record<string, unknown> | undefined
  return row === undefined ? null : asAgent(row)
}
/** One registry row as a participant. `runtimes` is every agent's runtime read at once, for a caller building them all. */
export function asAgent(row: Record<string, unknown>, runtimes?: ReadonlyMap<string, string | null>): RegisteredAgent {
  const who = whoTheRowSays(row)
  const pixelAppearance = row['pixel_appearance'] == null ? null : pixelAppearanceSchema.parse(JSON.parse(String(row['pixel_appearance'])))
  return {
    pixelAppearance,
    pixelScale: row['pixel_scale'] == null ? null : pixelScaleSchema.parse(JSON.parse(String(row['pixel_scale']))),
    id: who.id,
    name: who.name,
    handle: who.handle,
    avatarAssetId: String(row['avatar_asset_id']),
    state: row['state'] === null ? null : String(row['state']),
    stateAt: row['state_at'] === null ? null : String(row['state_at']),
    stateBy: whoSetIt(row['state_by_kind'], row['state_by_id']),
    // THE RUNTIME IS NOT ON THIS ROW. The record's `data.runtime` is the one
    // store. `runtimeOfTheAgentRecord` is the one reader of it. The `runtime` column is
    // left in place and dead — see the comment on it in db/schema.ts.
    runtime: runtimes === undefined ? runtimeOfTheAgentRecord(who.id) : (runtimes.get(who.id) ?? null),
    startedBy: who.startedBy,
    ownerId: typeof row['owner_id'] === 'string' ? row['owner_id'] : null,
    ownerKind: typeof row['owner_kind'] === 'string' ? row['owner_kind'] : null,
    role: who.role,
    // AND WHO CHOSE IT, criterion P75. `theMarkSaying` reads a stored value strictly and answers
    // null for anything it cannot make sense of, which is the same answer as an empty column: nobody
    // recorded who chose this card.
    cardChosenBy: theMarkSaying(
      typeof row['card_chosen_by'] === 'string' ? safelyParsed(row['card_chosen_by']) : row['card_chosen_by'],
    ),
    // THE GRANTS AS THEY ARE STORED, oldest first, and the last of them on its own. Whether the last
    // one HOLDS is `theElevationHeldBy` in lib/elevation.ts, which asks the clock and the card as
    // well; a reader that wants the fact rather than the row asks that.
    everyElevation: readElevations(row['elevation']),
    elevation: readElevation(row['elevation']),
    workArea: pathsOrNull(row['work_area']),
    startedFor: row['started_for'] === null || row['started_for'] === undefined ? null : String(row['started_for']),
    startedByRun:
      row['started_by_run'] === null || row['started_by_run'] === undefined ? null : String(row['started_by_run']),
    retired: who.retired,
    retiredBecause: row['retired_because'] === null ? null : String(row['retired_because']),
    // WHEN AND BY WHOM, problem zyCcJYCLsAe7. `undefined` is read as null for the reason the
    // credential below gives: a row read before the column existed is one nobody could have written.
    retiredAt:
      row['retired_at'] === null || row['retired_at'] === undefined ? null : String(row['retired_at']),
    retiredBy:
      row['retired_by_kind'] === null ||
      row['retired_by_kind'] === undefined ||
      row['retired_by_id'] === null ||
      row['retired_by_id'] === undefined
        ? null
        : { kind: String(row['retired_by_kind']) as ParticipantRef['kind'], id: String(row['retired_by_id']) },
    createdAt: who.createdAt,
    credential: who.credential,
    ...citizenshipOf(row),
    addressAs: addressAsOf(row),
    addressAsSetBy: addressAsSetByOf(row),
  }
}
/** How one stored row of either registry says it wishes to be addressed. */
export function addressAsOf(row: Record<string, unknown>): AddressAs {
  return theAddressAsStored({
    name: row[ADDRESS_AS_COLUMN.name],
    secondPerson: row[ADDRESS_AS_COLUMN.secondPerson],
    thirdPerson: row[ADDRESS_AS_COLUMN.thirdPerson],
    title: row[ADDRESS_AS_COLUMN.title],
  })
}
export function theParticipantByIdStatements(): { people: { get: (id: string) => unknown }; agents: { get: (id: string) => unknown } } {
  const kept = PARTICIPANT_BY_ID.get(sqlite)
  if (kept !== undefined) return kept
  const made = { people: sqlite.prepare('SELECT * FROM people WHERE id = ?'), agents: sqlite.prepare('SELECT * FROM agents WHERE id = ?') }
  PARTICIPANT_BY_ID.set(sqlite, made)
  return made
}
/**
 * ONE PAIR OF PREPARED STATEMENTS PER DATABASE HANDLE, NOT ONE PAIR PER PARTICIPANT. Same pattern
 * as `theAgentByHandleStatement` above.
 *
 * MEASURED, 11 September 2026 (problem 9UeL9VeVPn33): `readParticipant` is called once per
 * participant inside `participantPresence`, which `everybodysPresence` calls once per person and
 * once per agent in the registry — and each of those calls re-prepared one of these two statements
 * from its SQL text, rather than keeping the one it had already parsed.
 */
export const PARTICIPANT_BY_ID = new WeakMap<object, { people: { get: (id: string) => unknown }; agents: { get: (id: string) => unknown } }>()
/**
 * THE COLUMN EACH PART OF `addressAs` IS STORED IN, on `people` and on `agents` alike (migration
 * 0181). The parts are declared in src/shared/address-as.ts; this is only where each one is kept.
 */
export const ADDRESS_AS_COLUMN: Readonly<Record<AddressAsPart, string>> = {
  name: 'address_name',
  secondPerson: 'address_second_person',
  thirdPerson: 'address_third_person',
  title: 'address_title',
}
/**
 * WHO LAST SET THE ADDRESS ON ONE STORED ROW, AND WHEN (migration 0182), or null. All three columns are
 * written together by `setParticipantAddressAs`; a row with any of them missing is one nobody recorded.
 */
export function addressAsSetByOf(row: Record<string, unknown>): AddressAsSetBy {
  const kind = row['address_set_by_kind']
  const id = row['address_set_by_id']
  const at = row['address_set_at']
  if ((kind !== 'person' && kind !== 'agent') || typeof id !== 'string' || typeof at !== 'string') return null
  return { kind, id, at }
}
export function asPerson(row: Record<string, unknown>): RegisteredPerson {
  return {
    id: String(row['id']),
    name: String(row['name']),
    handle: String(row['handle']),
    avatarAssetId: String(row['avatar_asset_id']),
    state: row['state'] === null ? null : String(row['state']),
    stateAt: row['state_at'] === null ? null : String(row['state_at']),
    // A WORD THIS BUILD DOES NOT KNOW IS NOT A CHOICE. Null then means nobody has chosen, which is
    // the same answer an empty column gives, and the reader says so rather than passing the word on.
    presenceChoice: isPresenceChoice(row['presence_choice']) ? row['presence_choice'] : null,
    presenceChoiceAt: row['presence_choice_at'] === null ? null : String(row['presence_choice_at']),
    // AND THE SAME RULE FOR THE CIRCLE. A word this build does not know is nobody having chosen.
    circleShows: isCircleShows(row['circle_shows']) ? row['circle_shows'] : null,
    // AND THE SAME RULE FOR THE PICTURE. A name this build cannot draw is nobody having chosen,
    // which is what a reader is told rather than being sent an address that would 404.
    circlePicture: circlePicture(row['circle_picture'])?.name ?? null,
    // AND THE SAME RULE FOR WHICH NAME A LINK IN A MESSAGE DRAWS. Criterion M47.
    messageLinkLevel: isMessageLinkLevel(row['message_link_level']) ? row['message_link_level'] : null,
    // AND THE SAME RULE FOR WHERE THAT LINK SITS. Criterion M48.
    messageLinkLayout: isMessageLinkLayout(row['message_link_layout']) ? row['message_link_layout'] : null,
    messageProjectMark: isMessageProjectMark(row['message_project_mark']) ? row['message_project_mark'] : null,
    messagePictures: isMessagePictureChoice(row['message_pictures']) ? row['message_pictures'] : null,
    // AND THE SAME RULE FOR WHETHER MEDIA IN A RECORD ARE LOADED. Criterion U5. `media_load` and
    // `message_pictures` are two different settings on purpose: a word this build does not know is
    // nobody having chosen rather than being passed on.
    mediaLoad: isMediaLoadChoice(row['media_load']) ? row['media_load'] : null,
    // AND THE SAME RULE FOR THE CHAT'S OWN TEXT SIZE. Criterion M112.
    chatTextSize: isChatTextSize(row['chat_text_size']) ? row['chat_text_size'] : null,
    // AND FOR WHICH KEY SENDS A MESSAGE. A word this build does not know is nobody having chosen,
    // which reads as the owner's new default.
    sendKey: isSendKeySetting(row['send_key']) ? row['send_key'] : null,
    // AND FOR WHICH SHORTCUTS ARE ON. This is item 5 of a decision. Only
    // the door writes the column, and it writes only what `readShortcutSettings` accepted, so a
    // value that does not read is one this build did not write; the same rule as the words above
    // makes it nobody having chosen.
    shortcuts: theStoredShortcuts(row['shortcuts']),
    // AND FOR WHEN THE CHAT CIRCLE SHOWS AND HOW THE CHAT OPENS: a word this build does not know is
    // nobody having chosen, which reads as what the chat does today.
    chatButtonStays: isChatButtonStays(row['chat_button_stays']) ? row['chat_button_stays'] : null,
    chatOpensAs: isChatOpensAs(row['chat_opens_as']) ? row['chat_opens_as'] : null,
    chatLayout: isChatLayout(row['chat_layout']) ? row['chat_layout'] : null,
    // AND FOR THE PERSON'S OWN MESSAGE LABELS: only the door writes the column, and only what
    // `readMessageLabels` accepted, so a value that does not read is one this build did not write.
    chatLabels: theStoredMessageLabels(row['chat_labels']),
    // AND FOR THE PERSON'S OWN SETTINGS FOR THE SHIPPED FLAGS AND 'NO MARK': the same rule, because only the
    // door writes the column and only what `readShippedFlags` accepted.
    shippedFlags: theStoredShippedFlags(row['shipped_flags']),
    language: isLanguage(row['language']) ? row['language'] : null,
    createdAt: String(row['created_at']),
    ...citizenshipOf(row),
    // WHICH CARD THEY HOLD AND WHAT THEY DO. Criterion P45. Both are read as stored: a word this
    // build does not know is still the word somebody wrote, and it is the card list that says
    // whether it names a card. Empty is read as null, because a blank column is nobody having
    // written one rather than somebody having written nothing.
    role: typeof row['role'] === 'string' && row['role'].trim() !== '' ? row['role'].trim() : null,
    occupation:
      typeof row['occupation'] === 'string' && row['occupation'].trim() !== '' ? row['occupation'].trim() : null,
    portrait: typeof row['portrait'] === 'string' && row['portrait'].trim() !== '' ? row['portrait'].trim() : null,
    addressAs: addressAsOf(row),
    addressAsSetBy: addressAsSetByOf(row),
  }
}
/**
 * The three citizenship columns off a row, read the same way for both registries.
 *
 * ONE READER FOR TWO TABLES, because `people` and `agents` carry exactly the same three columns and
 * two readers for one shape is how the two come to disagree.
 */
export function citizenshipOf(row: Record<string, unknown>): {
  homeWorld: string | null
  homeInstallation: string | null
  citizenSince: string | null
} {
  const said = (key: string): string | null => {
    const value = row[key]
    return value === null || value === undefined ? null : String(value)
  }
  return { homeWorld: said('home_world'), homeInstallation: said('home_installation'), citizenSince: said('citizen_since') }
}
/**
 * WHICH RUNTIME SERVES THIS AGENT, read from its agent record and from nowhere else.
 *
 * THE ONE PLACE THIS FACT IS READ. The registry row used to carry a second copy, written at
 * registration and never changed afterwards, while the agent record's `data.runtime` was the door
 * a PATCH could change. On 14 September 2026 a dsh worker was resumed as a Claude subagent and the
 * record was corrected while the row was not, so two doors answered two runtimes for one agent. A
 * decision, at option A of proposal `nfETNdLvpE5P`, makes the record the one store and the row
 * read it here.
 *
 * THE NEWEST RECORD WHERE THERE ARE SEVERAL, the same reading `recordForAgentIn` and
 * `theProjectOfTheAgentRecord` use: a registry row is the installation's and an `agent` record
 * belongs to one project, so one agent may have a record in more than one.
 *
 * A WORD THIS BUILD HAS NO ADAPTER FOR IS NOT AN ANSWER. `declaredRuntimeOrNull` is the one place
 * that decides, exactly as the migration and the write gate already read it; null is a real answer
 * and means no record here names a runtime, which is not the same as a default.
 */
export function runtimeOfTheAgentRecord(agentId: string): string | null {
  return theRuntimeOnTheNewestRecord(theRuntimeForAgentStatement().get(agentId) as { runtime?: unknown } | undefined)
}
/** The stored shortcuts column read back, or null because nobody chose or it does not read. */
export function theStoredShortcuts(held: unknown): ShortcutSettings | null {
  if (typeof held !== 'string') return null
  let parsed: unknown
  try {
    parsed = JSON.parse(held)
  } catch {
    return null
  }
  const read = readShortcutSettings(parsed)
  return read.ok ? read.settings : null
}
/**
 * The participant a stored setter names, or null because nothing usable is stored.
 *
 * A kind this build does not know is null rather than passed on, which is the same rule every
 * reading function in this product follows: a stored word nobody can read must not reach a screen.
 */
export function whoSetIt(kind: unknown, id: unknown): ParticipantRef | null {
  if (!isParticipantKind(kind)) return null
  if (id === null || id === undefined || String(id) === '') return null
  return { kind, id: String(id) }
}
/**
 * THE LABELS THE ROW HOLDS, read again by the same reader; null only when nobody made one. Only the door writes
 * the column, and only what the reader took, so a value that does not read now was written by an earlier build,
 * or the reader has become stricter since. That is unreadable, with the reader's sentences, and never null: the
 * page then draws no own labels and writes nothing over them.
 */
export function theStoredMessageLabels(held: unknown): TheStoredMessageLabels {
  if (held === null || held === undefined) return null
  if (typeof held !== 'string') return { unreadable: [enWave13y['settingsPanel.chatLabels.unreadableNotText']] }
  let parsed: unknown
  try {
    parsed = JSON.parse(held)
  } catch {
    return { unreadable: [enWave13y['settingsPanel.chatLabels.unreadableNotJson']] }
  }
  const read = readMessageLabels(parsed)
  return read.ok ? read.labels : { unreadable: [read.why] }
}
/** The stored shipped-flags column read back, or null because nobody changed one or it does not read. */
export function theStoredShippedFlags(held: unknown): StoredShippedFlags | null {
  if (typeof held !== 'string') return null
  let parsed: unknown
  try {
    parsed = JSON.parse(held)
  } catch {
    return null
  }
  const read = readShippedFlags(parsed)
  return read.ok ? read.flags : null
}
/**
 * THE WORK AREA A STORED VALUE NAMES, or null because nothing usable is stored.
 *
 * The column is JSON, so better-sqlite3 hands back whatever was written. A value that is not a list
 * of strings is read as null rather than half-read: a work area is what somebody will search when
 * they check this agent, and half of one would send them to the wrong place. An empty list is kept
 * as an empty list, because "there is no area" and "nobody recorded one" are different answers.
 */
export function pathsOrNull(value: unknown): string[] | null {
  if (value === null || value === undefined) return null
  const said = typeof value === 'string' ? safelyParsed(value) : value
  if (!Array.isArray(said)) return null
  if (!said.every((one) => typeof one === 'string')) return null
  return said as string[]
}
export function safelyParsed(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
/**
 * WHO AN AGENT IS, READ OFF ITS REGISTRY ROW, here and only here: for the participant `asAgent` builds, and for the
 * roster `everyAgentOnTheRoster` reads (wave 13y round 50).
 */
export function whoTheRowSays(row: Record<string, unknown>): WhoAnAgentIs {
  return {
    id: String(row['id']),
    handle: String(row['handle']),
    name: String(row['name']),
    role: theRoleOnTheRow(row),
    retired: row['retired'] === 1,
    // WHICH CREDENTIAL THE OFFICE LET THIS AGENT IN ON, criterion P69, or null because it needed
    // none. `undefined` is read as null too: a row read before the column existed is one nobody
    // could have written a credential on.
    credential: row['credential'] === null || row['credential'] === undefined ? null : String(row['credential']),
    // THE SAME READING `stateBy` GETS, and for the same reason: a stored kind this build cannot read
    // must not reach a screen as half a participant.
    startedBy: whoSetIt(row['started_by_kind'], row['started_by_id']),
    createdAt: String(row['created_at']),
  }
}
