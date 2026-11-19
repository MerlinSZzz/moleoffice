// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MERGE QUEUE'S OWNER: THE ONE SETTING, READ AND WRITTEN HERE AND NOWHERE ELSE. A decision
 * and the answers lOBUitZaMl1N and EI3_Msuradr7 put it here.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * Besides the person, the merge queue's owner may move a merge entry to the front of its lane
 * (POST /api/merge-queue/<id>/first), and only with its own key. Not every secretary: one that could move its own
 * entries could jump the queue. The person names the owner on the Settings page. Nobody else may, except a secretary
 * the person has raised.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE IT LIVES, AND WHAT EACH VALUE MEANS
 * ---------------------------------------------------------------------------------------
 *
 * One column on the installation row, `merge_queue_owner`, added by migration 0208. It holds the registry id of one
 * agent. NULL is nobody having named one, and then only the person may move an entry. The product names no agent of
 * its own, so there is no default.
 *
 * THE READER CHECKS EVERY TIME, AND NEVER FALLS BACK. An agent qualifies when it is registered, is not retired, and
 * holds the secretary's card: the queue was given to a secretary, and the picker would
 * otherwise offer every agent the office has ever registered. When the column is empty, or names an agent that does
 * not qualify now, the answer is nobody, with the reason.
 */

import { sayInEnglish } from '@shared/i18n.ts'
import type { ParticipantRef } from '@shared/participants.ts'
import { THE_SECRETARY } from '@shared/roles.ts'
import { sqlite } from '../db/client.ts'
import { type RegisteredAgent } from './participants.ts'
import { listParticipants } from '../db/list-participants.ts'
import { readParticipant } from '../db/read-participant.ts'
// PanelError, SO THE SENTENCE REACHES WHOEVER ASKED. It is only built when a reader or the writer
// throws, never at import, so the import cycle through records.ts is safe.
import { PanelError } from './panel-error.ts'

/** Why the merge queue has no owner, or null because it has one. */
export type WhyTheMergeQueueHasNoOwner = 'nobody chose' | 'not registered' | 'retired' | 'not a secretary'

/** One agent that may be named, as the panel lists it. */
export interface AnAgentWhoMayOwnTheMergeQueue {
  id: string
  handle: string
  name: string
}

/** The reading: who owns the merge queue now, or why nobody does. */
export interface TheMergeQueueOwner {
  /** The agent that owns the merge queue now, or null because nobody qualifies. */
  named: AnAgentWhoMayOwnTheMergeQueue | null
  /** Why nobody owns it, or null because `named` is somebody. */
  nobodyBecause: WhyTheMergeQueueHasNoOwner | null
  /** What the column holds, exactly, or null because nobody named one. */
  stored: string | null
  /** The name the stored value reads as, for the sentence: the agent's name, or the stored id itself. */
  storedName: string | null
  /** The reading in one English sentence. A page builds the same sentence from the fields above. */
  says: string
  /** Every agent that qualifies now, in registry order. The panel offers these. */
  mayBeNamed: AnAgentWhoMayOwnTheMergeQueue[]
}

/** One registry row as the panel lists it. */
function asChoice(row: RegisteredAgent): AnAgentWhoMayOwnTheMergeQueue {
  return { id: row.id, handle: row.handle, name: row.name }
}

/** The stored value exactly as SQLite hands it over, or null because nobody chose or there is no row. */
function theStoredValue(): unknown {
  const row = sqlite.prepare('SELECT merge_queue_owner AS who FROM installation WHERE only_row = 1').get() as
    | { who: unknown }
    | undefined
  return row?.who ?? null
}

/**
 * WHY THIS AGENT MAY NOT OWN THE MERGE QUEUE, or null because it may. The one check, asked by the reader every time
 * and by the writer before it writes.
 */
function whyThisAgentMayNotOwnIt(row: RegisteredAgent | null): Exclude<WhyTheMergeQueueHasNoOwner, 'nobody chose'> | null {
  if (row === null) return 'not registered'
  if (row.retired) return 'retired'
  if (row.role !== THE_SECRETARY) return 'not a secretary'
  return null
}

/** The English sentence for a reading. The page says the same from the same word keys. */
function theSentence(nobodyBecause: WhyTheMergeQueueHasNoOwner | null, who: string): string {
  switch (nobodyBecause) {
    case null:
      return sayInEnglish('mergeQueueOwner.named', { who })
    case 'nobody chose':
      return sayInEnglish('mergeQueueOwner.nobody.nobodyChose')
    case 'not registered':
      return sayInEnglish('mergeQueueOwner.nobody.notRegistered', { who })
    case 'retired':
      return sayInEnglish('mergeQueueOwner.nobody.retired', { who })
    case 'not a secretary':
      return sayInEnglish('mergeQueueOwner.nobody.notASecretary', { who })
  }
}

/**
 * WHO OWNS THE MERGE QUEUE NOW, OR WHY NOBODY DOES. The one reader.
 *
 * Read from the row on every call, with nothing cached, so a name chosen on the Settings page holds for the very next
 * move, and an agent retired since it was named stops qualifying at once.
 */
export function theMergeQueueOwner(): TheMergeQueueOwner {
  const stored = theStoredValue()
  const mayBeNamed = listParticipants().agents.filter((one) => whyThisAgentMayNotOwnIt(one) === null).map(asChoice)
  if (stored === null) {
    return { named: null, nobodyBecause: 'nobody chose', stored: null, storedName: null, says: theSentence('nobody chose', ''), mayBeNamed }
  }
  if (typeof stored !== 'string' || stored === '') {
    throw new PanelError(
      `The merge queue's owner is stored as ${JSON.stringify(stored)} in installation.merge_queue_owner, and this ` +
        'office reads only nothing or an agent\'s id there. Nothing was guessed and nothing was changed.',
      500,
      undefined,
      undefined,
      undefined,
      { code: 'mergeQueueOwnerUnreadable', values: {} },
    )
  }
  const row = readParticipant({ kind: 'agent', id: stored }) as RegisteredAgent | null
  const storedName = row?.name ?? stored
  const why = whyThisAgentMayNotOwnIt(row)
  return {
    named: why === null && row !== null ? asChoice(row) : null,
    nobodyBecause: why,
    stored,
    storedName,
    says: theSentence(why, storedName),
    mayBeNamed,
  }
}

/** The agent that owns the merge queue now, as a participant, or null because nobody does. */
export function theAgentThatOwnsTheMergeQueue(): ParticipantRef | null {
  const reading = theMergeQueueOwner()
  return reading.named === null ? null : { kind: 'agent', id: reading.named.id }
}

/**
 * NAME THE MERGE QUEUE'S OWNER, OR NAME NOBODY, AND ANSWER WITH THE READING.
 *
 * `id` is a registry id the caller already resolved, or null to name nobody. The caller has already checked who is
 * asking. An agent that does not qualify now is refused before anything is written, with the reason. An update that
 * changed no row means this database has no installation row, and that is said rather than answered as done.
 */
export function setTheMergeQueueOwner(id: string | null): TheMergeQueueOwner {
  if (id !== null) {
    const row = readParticipant({ kind: 'agent', id }) as RegisteredAgent | null
    const why = whyThisAgentMayNotOwnIt(row)
    if (why !== null) {
      const name = row?.name ?? id
      const tail =
        ", so it cannot own the merge queue. Name a secretary that is registered and not retired. " +
        'GET /api/office/merge-queue-owner lists them. Nothing was changed.'
      // ONE REFUSAL PER REASON, each with its own code, so the page says the reason in its own language.
      if (why === 'not registered') {
        throw new PanelError(`"${name}" is not a registered agent here${tail}`, 400, undefined, undefined, undefined, {
          code: 'mergeQueueOwnerNotRegistered',
          values: {},
        })
      }
      if (why === 'retired') {
        throw new PanelError(`${name} is retired${tail}`, 400, undefined, undefined, undefined, {
          code: 'mergeQueueOwnerRetired',
          values: {},
        })
      }
      throw new PanelError(`${name} does not hold the secretary's card${tail}`, 400, undefined, undefined, undefined, {
        code: 'mergeQueueOwnerNotASecretary',
        values: {},
      })
    }
  }
  const written = sqlite.prepare('UPDATE installation SET merge_queue_owner = ? WHERE only_row = 1').run(id)
  if (written.changes !== 1) {
    throw new PanelError(
      "This database has no installation row, so the merge queue's owner could not be stored. Nothing was changed.",
      500,
      undefined,
      undefined,
      undefined,
      { code: 'mergeQueueOwnerNoInstallationRow', values: {} },
    )
  }
  return theMergeQueueOwner()
}
