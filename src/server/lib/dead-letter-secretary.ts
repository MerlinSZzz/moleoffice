// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SECRETARY WHO TAKES THE DEAD LETTERS: THE ONE SETTING, READ AND WRITTEN HERE AND NOWHERE ELSE.
 * Problem 0WUuvB0IhRfb, with the secretary's answers I24sT059xQlk and UEmOvQ6-ptyJ.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * The dead-letter sweep addresses its notice directly to this one agent. A letter from the person
 * to a retired agent is copied to this agent, and an
 * agent's letter whose chain of starters ends at the person goes to this agent instead. The person
 * names the agent on the Settings page. Nobody else may.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE IT LIVES, AND WHAT EACH VALUE MEANS
 * ---------------------------------------------------------------------------------------
 *
 * One column on the installation row, `dead_letter_secretary`, added by migration 0198. It holds the
 * registry id of one agent. NULL is nobody having named one.
 *
 * THE READER CHECKS EVERY TIME, AND NEVER FALLS BACK. An agent qualifies when it is registered, is
 * not retired, and its card holds the act `dead-letters.claim`. That last rule is
 * `theAgentsWhoClaimDeadLetters` in lib/deadletters.ts, asked here rather than written again. When the
 * column is empty, or names an agent that does not qualify now, the answer is nobody, with the reason.
 * It is never every secretary.
 */

import { sayInEnglish } from '@shared/i18n.ts'
import type { ParticipantRef } from '@shared/participants.ts'
import { sqlite } from '../db/client.ts'
import { theAgentsWhoClaimDeadLetters } from './the-agents-who-claim-dead-letters.ts'
import { theDeadLetterActInWords } from './the-dead-letter-act-in-words.ts'
import { type RegisteredAgent } from './participants.ts'
import { listParticipants } from '../db/list-participants.ts'
import { readParticipant } from '../db/read-participant.ts'
// PanelError, SO THE SENTENCE REACHES WHOEVER ASKED. It is only built when a reader or the writer
// throws, never at import, so the import cycle through records.ts is safe.
import { PanelError } from './panel-error.ts'

/** Why nobody takes the dead letters, or null because somebody does. */
export type WhyNobodyTakesTheDeadLetters = 'nobody chose' | 'not registered' | 'retired' | 'no act'

/** One agent that may be named, as the panel lists it. */
export interface ASecretaryWhoMayTakeTheDeadLetters {
  id: string
  handle: string
  name: string
}

/** The reading: who takes the dead letters now, or why nobody does. */
export interface TheDeadLetterSecretary {
  /** The agent who takes them now, or null because nobody qualifies. */
  named: ASecretaryWhoMayTakeTheDeadLetters | null
  /** Why nobody takes them, or null because `named` is somebody. */
  nobodyBecause: WhyNobodyTakesTheDeadLetters | null
  /** What the column holds, exactly, or null because nobody named one. */
  stored: string | null
  /** The name the stored value reads as, for the sentence: the agent's name, or the stored id itself. */
  storedName: string | null
  /** The dead-letter act in the role declaration's own words. */
  act: string
  /** The reading in one English sentence. A page builds the same sentence from the fields above. */
  says: string
  /** Every agent that qualifies now, in registry order. The panel offers these. */
  mayBeNamed: ASecretaryWhoMayTakeTheDeadLetters[]
}

/** One registry row as the panel lists it. */
function asChoice(row: RegisteredAgent): ASecretaryWhoMayTakeTheDeadLetters {
  return { id: row.id, handle: row.handle, name: row.name }
}

/** The stored value exactly as SQLite hands it over, or null because nobody chose or there is no row. */
function theStoredValue(): unknown {
  const row = sqlite.prepare('SELECT dead_letter_secretary AS who FROM installation WHERE only_row = 1').get() as
    | { who: unknown }
    | undefined
  return row?.who ?? null
}

/** Every agent that qualifies now, as registry rows. */
function everyAgentThatQualifies(): RegisteredAgent[] {
  const claimants = new Set(theAgentsWhoClaimDeadLetters().map((one) => one.id))
  return listParticipants().agents.filter((one) => claimants.has(one.id))
}

/**
 * WHY THIS AGENT MAY NOT TAKE THE DEAD LETTERS, or null because it may. The one check, asked by the
 * reader every time and by the writer before it writes.
 */
function whyThisAgentMayNotTakeThem(id: string): Exclude<WhyNobodyTakesTheDeadLetters, 'nobody chose'> | null {
  const row = readParticipant({ kind: 'agent', id }) as RegisteredAgent | null
  if (row === null) return 'not registered'
  if (row.retired) return 'retired'
  if (!theAgentsWhoClaimDeadLetters().some((one) => one.id === id)) return 'no act'
  return null
}

/** The English sentence for a reading. The page says the same from the same word keys. */
function theSentence(nobodyBecause: WhyNobodyTakesTheDeadLetters | null, who: string, act: string): string {
  switch (nobodyBecause) {
    case null:
      return sayInEnglish('deadLetterSecretary.named', { who })
    case 'nobody chose':
      return sayInEnglish('deadLetterSecretary.nobody.nobodyChose')
    case 'not registered':
      return sayInEnglish('deadLetterSecretary.nobody.notRegistered', { who })
    case 'retired':
      return sayInEnglish('deadLetterSecretary.nobody.retired', { who })
    case 'no act':
      return sayInEnglish('deadLetterSecretary.nobody.noAct', { who, act })
  }
}

/**
 * WHO TAKES THE DEAD LETTERS NOW, OR WHY NOBODY DOES. The one reader.
 *
 * Read from the row on every call, with nothing cached, so a name chosen on the Settings page holds
 * for the very next sweep, and an agent retired since it was named stops qualifying at once.
 */
export function theDeadLetterSecretary(): TheDeadLetterSecretary {
  const stored = theStoredValue()
  const act = theDeadLetterActInWords()
  const mayBeNamed = everyAgentThatQualifies().map(asChoice)
  if (stored === null) {
    return { named: null, nobodyBecause: 'nobody chose', stored: null, storedName: null, act, says: theSentence('nobody chose', '', act), mayBeNamed }
  }
  if (typeof stored !== 'string' || stored === '') {
    throw new PanelError(
      `The secretary who takes the dead letters is stored as ${JSON.stringify(stored)} in ` +
        'installation.dead_letter_secretary, and this office reads only nothing or an agent\'s id there. Nothing was ' +
        'guessed and nothing was changed.',
      500,
      undefined,
      undefined,
      undefined,
      { code: 'deadLetterSecretaryUnreadable', values: {} },
    )
  }
  const row = readParticipant({ kind: 'agent', id: stored }) as RegisteredAgent | null
  const storedName = row?.name ?? stored
  const why = whyThisAgentMayNotTakeThem(stored)
  return {
    named: why === null && row !== null ? asChoice(row) : null,
    nobodyBecause: why,
    stored,
    storedName,
    act,
    says: theSentence(why, storedName, act),
    mayBeNamed,
  }
}

/** The agent who takes the dead letters now, as a participant, or null because nobody does. */
export function theAgentWhoTakesTheDeadLetters(): ParticipantRef | null {
  const reading = theDeadLetterSecretary()
  return reading.named === null ? null : { kind: 'agent', id: reading.named.id }
}

/**
 * NAME THE SECRETARY WHO TAKES THE DEAD LETTERS, OR NAME NOBODY, AND ANSWER WITH THE READING.
 *
 * `id` is a registry id the caller already resolved, or null to name nobody. The caller has already
 * checked who is asking. An agent that does not qualify now is refused before anything is written,
 * with the reason. An update that changed no row means this database has no installation row, and
 * that is said rather than answered as done.
 */
export function setTheDeadLetterSecretary(id: string | null): TheDeadLetterSecretary {
  if (id !== null) {
    const why = whyThisAgentMayNotTakeThem(id)
    if (why !== null) {
      const row = readParticipant({ kind: 'agent', id }) as RegisteredAgent | null
      const name = row?.name ?? id
      const tail =
        ', so it cannot take the dead letters. Name an agent that is registered, not retired, and holds the dead-letter ' +
        'act. GET /api/office/dead-letter-secretary lists them. Nothing was changed.'
      // ONE REFUSAL PER REASON, each with its own code, so the page says the reason in its own language.
      if (why === 'not registered') {
        throw new PanelError(`"${name}" is not a registered agent here${tail}`, 400, undefined, undefined, undefined, {
          code: 'deadLetterSecretaryNotRegistered',
          values: {},
        })
      }
      if (why === 'retired') {
        throw new PanelError(`${name} is retired${tail}`, 400, undefined, undefined, undefined, {
          code: 'deadLetterSecretaryRetired',
          values: {},
        })
      }
      throw new PanelError(`${name}'s card does not hold the act "${theDeadLetterActInWords()}"${tail}`, 400, undefined, undefined, undefined, {
        code: 'deadLetterSecretaryNoAct',
        values: {},
      })
    }
  }
  const written = sqlite.prepare('UPDATE installation SET dead_letter_secretary = ? WHERE only_row = 1').run(id)
  if (written.changes !== 1) {
    throw new PanelError(
      'This database has no installation row, so the secretary who takes the dead letters could not be stored. ' +
        'Nothing was changed.',
      500,
      undefined,
      undefined,
      undefined,
      { code: 'deadLetterSecretaryNoInstallationRow', values: {} },
    )
  }
  return theDeadLetterSecretary()
}
