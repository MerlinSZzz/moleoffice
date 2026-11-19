// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { content, t } from '@shared/i18n.ts'
import {
  THE_DEV_SUPERVISOR_ID,
  THE_MESSAGE_WORKER_ID,
  THE_OFFICE_WRITER_ID,
  THE_WORLD_SWEEP_ID,
  isOneOfTheOfficesOwnWriters,
  type TheOfficesOwnWriterId,
} from '@shared/participants.ts'
import { actorTypeWord } from '@shared/words.ts'
import type { ParticipantOnTheWire } from '../api.ts'

/** Only the registry fields used to find and name a writer. */
export type ParticipantsNamed = {
  people: readonly Pick<ParticipantOnTheWire, 'id' | 'handle' | 'name'>[]
  agents: readonly Pick<ParticipantOnTheWire, 'id' | 'handle' | 'name'>[]
}

/**
 * WHICH REGISTERED PARTICIPANT A STORED ID OR HANDLE NAMES, worked out in one place (problem
 * jwTEOmhtXg20, invariant 9).
 *
 * `ParticipantName` in pages/NotebookPage.tsx and `ownerName` in pages/HorizonsPage.tsx both call this.
 * It looks for a row whose id is the text, then for the one row whose handle is the text. When two
 * rows bear the handle, or none matches, it answers undefined, and each caller says what it shows
 * then. The caller chooses the rows: `ParticipantName` passes one registry, `ownerName` passes both.
 */
export function theParticipantAStoredIdNames<Row extends { id: string; handle: string }>(
  rows: readonly Row[],
  idOrHandle: string,
): Row | undefined {
  const exact = rows.find((one) => one.id === idOrHandle)
  if (exact !== undefined) return exact
  const handles = rows.filter((one) => one.handle === idOrHandle)
  return handles.length === 1 ? handles[0] : undefined
}

/**
 * WHO WROTE A STORED ROW, BY THE NAME A PERSON KNOWS THEM BY (wave 13k round 34).
 *
 * A change row, a revision and a record's filing store the writer's kind and id, and for an agent that id
 * is its handle. The record page drew the handle ("Last changed just now by kiln-ledger") or the kind
 * ("person") where the writer belongs. Every place on that page that names a writer calls this, so they
 * cannot name one writer two ways (invariant 9); developer mode draws the stored id beside the kind, as
 * each caller already did.
 *
 * - A person or an agent the registries hold is named by its registry name, found by id or by its one
 *   handle (`theParticipantAStoredIdNames`), in the registry its kind says.
 * - The office's own writes are named by the office's word, because its stored id is not a name. That is
 *   a `system` row, and an agent row stored under `THE_OFFICE_WRITER_ID`, which the API server writes as.
 * - An agent row stored under the id of another part of the office (`THE_OFFICES_OWN_WRITER_IDS`) is named
 *   as that part of Mole Office, the way the merge tool's commits are ("Mole Office merge queue"), with or
 *   without the registries (wave 13p round 29).
 * - A writer no registry holds is said to be unregistered, by kind. Its stored id is developer mode's.
 * - With no registries handed over, the writer's kind ("person", "agent"): there is nothing to look a name
 *   up in, so "unregistered" would be a guess, and the stored id is developer mode's.
 */
export function writerNamed(
  who: { actorType: string; actorId: string },
  participants: ParticipantsNamed | undefined,
): string {
  if (who.actorType === 'system') return actorTypeWord('system').text
  if (isOneOfTheOfficesOwnWriters(who)) return theOfficesOwnWriterNamed(who.actorId as TheOfficesOwnWriterId)
  if (participants === undefined) return actorTypeWord(who.actorType).text
  const rows =
    who.actorType === 'human'
      ? participants.people
      : who.actorType === 'agent'
        ? participants.agents
        : [...participants.people, ...participants.agents]
  const found = theParticipantAStoredIdNames(rows, who.actorId)
  if (found !== undefined) return content(found.name)
  return t(
    who.actorType === 'agent'
      ? 'record.writer.unregisteredAgent'
      : who.actorType === 'human'
        ? 'record.writer.unregisteredPerson'
        : 'record.writer.unregistered',
  )
}

/**
 * WHAT EACH PART OF THE OFFICE THAT WRITES IS CALLED. The API server is the office itself, so it gets the
 * office's word; each other part is "Mole Office" and what it is. The table is keyed by every id in
 * `THE_OFFICES_OWN_WRITER_IDS`, so an id added there and not named here fails the type check.
 */
const THE_WORD_FOR_EACH_OF_THE_OFFICES_OWN_WRITERS: Readonly<Record<TheOfficesOwnWriterId, () => string>> = {
  [THE_OFFICE_WRITER_ID]: () => actorTypeWord('system').text,
  [THE_MESSAGE_WORKER_ID]: () => t('record.writer.theMessageWorker'),
  [THE_DEV_SUPERVISOR_ID]: () => t('record.writer.theDevSupervisor'),
  [THE_WORLD_SWEEP_ID]: () => t('record.writer.theWorldSweep'),
}

function theOfficesOwnWriterNamed(id: TheOfficesOwnWriterId): string {
  return THE_WORD_FOR_EACH_OF_THE_OFFICES_OWN_WRITERS[id]()
}
