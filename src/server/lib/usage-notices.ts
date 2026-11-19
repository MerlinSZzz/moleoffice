// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHO TAKES THE USAGE NOTICES, AND WHAT THEIR 80% SENTENCE SAYS TO DO: TWO SETTINGS, THEIR READERS AND THEIR WRITERS.
 * Wave 13y round 136.
 *
 * The office writes a notice when the sandboxes' Claude login has used 50% or 80% of its seven days
 * (`tellTheSecretaryHowMuchOfTheWeekIsUsed` in lib/logins-week.ts). It goes to one secretary. These two settings say
 * which secretary, and what the notice at 80% says to do.
 *
 * ---------------------------------------------------------------------------------------
 * WHO TAKES THE NOTICES
 * ---------------------------------------------------------------------------------------
 *
 * 1. THE SECRETARY CHOSEN HERE, when the setting names an agent that is registered, is not retired and holds the
 *    secretary card.
 * 2. THE FIRST SECRETARY APPOINTED, when nobody is chosen, and also when the agent chosen cannot take them now. The
 *    first appointed is the un-retired secretary whose agent was registered first, as the registry's stamps order them,
 *    and then the first by id. When the agent chosen cannot take them, the reading says who it is and why, and the
 *    notice ends with that same sentence, so the secretary who gets it can change the choice.
 * 3. NOBODY, when this office has no secretary. The reading says so.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE NOTICE AT 80% SAYS TO DO
 * ---------------------------------------------------------------------------------------
 *
 * The words set here, with the id of the usage decision they come from. The setting holds the words and the id
 * together, so the notice says the words that were set and names where they came from. The record must be a decision
 * when the words are set. After that, the notice names it by the id stored, and the reading reads only its title again,
 * so a person sees which decision it is (round 140, item 79d). With nothing set, the notice says so and asks the
 * secretary to ask the owner.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE THE SETTINGS LIVE
 * ---------------------------------------------------------------------------------------
 *
 * In the office's change log, on the row ids `setting:usage-notice-secretary` and `setting:usage-decision`, as the GPU
 * watcher's setting is kept: no migration adds a column. Each change is one row, written by `writeDownASettingChange`,
 * and the value in force is the newest row, read by `theLastChangeOfASetting`. The first holds the JSON
 * {"secretary": <registry id> | null, "because": <reason> | null}. The second holds {"whatToDo": <words> | null,
 * "decision": <record id> | null, "because": <reason> | null}, with the words and the id both set or both null. A row in
 * another shape is refused loudly. No row means nobody has set it.
 *
 * NOTHING IS CACHED. Every reading reads the newest rows and the registry again.
 */
import { sayInEnglish } from '@shared/i18n.ts'
import type { ParticipantRef } from '@shared/participants.ts'
import { withArticle } from '@shared/work.ts'
import { kindWord } from '@shared/words.ts'
import { sqlite } from '../db/client.ts'
import { type RegisteredAgent } from './participants.ts'
import { participantForActor } from './participant-for-actor.ts'
import { readParticipant } from '../db/read-participant.ts'
// PanelError, SO THE SENTENCE REACHES WHOEVER ASKED. Only built when a reader or a writer refuses, never at import.
import { getRecord, theLastChangeOfASetting, writeDownASettingChange, type Actor } from './records.ts'
import { PanelError } from './panel-error.ts'
import { theSecretaries } from './secretariat.ts'

/** The settings' names in the change log, after `setting:`. */
export const USAGE_NOTICE_SECRETARY_SETTING = 'usage-notice-secretary'
export const USAGE_DECISION_SETTING = 'usage-decision'

/** The most characters the words of a usage decision may have. A notice ends with them. */
export const WHAT_TO_DO_MOST = 600

/** One secretary as the reading names it and as the choice offers it. */
export interface AUsageNoticeChoice {
  id: string
  handle: string
  name: string
}

/** Why the agent chosen cannot take the notices now. */
export type WhyTheChosenCannotTakeThem = 'not registered' | 'retired' | 'not a secretary'

/** The agent the setting names when it cannot take the notices now. */
export interface AChosenWhoCannot {
  stored: string
  storedName: string
  cannotBecause: WhyTheChosenCannotTakeThem
}

/**
 * WHO TAKES THE USAGE NOTICES NOW, AND WHERE THAT CAME FROM.
 *
 *   set here                       the setting names `agent`, which can take them.
 *   the first secretary appointed  nobody is chosen (`chosen` is null), or the agent chosen cannot take them (`chosen`).
 *   no secretary                   this office has no secretary, so nobody is told.
 */
export type TheUsageNoticeSecretaryInForce =
  | { from: 'set here'; agent: AUsageNoticeChoice }
  | { from: 'the first secretary appointed'; agent: AUsageNoticeChoice; chosen: AChosenWhoCannot | null }
  | { from: 'no secretary'; chosen: AChosenWhoCannot | null }

/** The whole reading, as GET /api/office/usage-notice-secretary answers it. */
export interface TheUsageNoticeSecretary {
  inForce: TheUsageNoticeSecretaryInForce
  /** The registry id the setting holds, or null because it names nobody or was never set. */
  stored: string | null
  /** Whether anybody has set the setting, to an agent or to nobody. False means no change row exists. */
  everSet: boolean
  /** The reason given with the newest change, or null because none was given or nothing was set. */
  because: string | null
  /** The reading in one English sentence. A notice that goes to the first appointed instead ends with it. */
  says: string
  /** Every secretary that can take the notices, first appointed first. */
  mayBeChosen: AUsageNoticeChoice[]
}

/** What the notice at 80% says to do now. `title` is the decision's title as its record has it now. */
export type TheUsageDecisionInForce = { from: 'set here'; whatToDo: string; decision: string; title: string } | { from: 'not set' }

/** The whole reading, as GET /api/office/usage-decision answers it. */
export interface TheUsageDecision {
  inForce: TheUsageDecisionInForce
  /** Whether anybody has set the setting, to words or to nothing. False means no change row exists. */
  everSet: boolean
  /** The reason given with the newest change, or null because none was given or nothing was set. */
  because: string | null
  /** The reading in one English sentence. */
  says: string
}

interface AStoredReceiver {
  secretary: string | null
  because: string | null
}

interface AStoredDecision {
  whatToDo: string | null
  decision: string | null
  because: string | null
}

/**
 * THE NEWEST VALUE OF ONE OF THE TWO SETTINGS, or null because nobody has set it. A row in another shape is refused
 * loudly, because a guess would send the notice to the wrong secretary or put words in it nobody set.
 */
function theStoredValue(setting: string, keys: readonly string[], shape: string, fits: (value: Record<string, unknown>) => boolean): Record<string, unknown> | null {
  const last = theLastChangeOfASetting(setting)
  if (last === null) return null
  let said: unknown
  try {
    said = last.to === null ? null : JSON.parse(last.to)
  } catch {
    said = undefined
  }
  if (typeof said !== 'object' || said === null || Array.isArray(said) || Object.keys(said).sort().join(',') !== [...keys].sort().join(',') || !fits(said as Record<string, unknown>)) {
    throw new PanelError(
      `The newest change to ${setting} in the change log holds ${JSON.stringify(last.to)}, and this office reads only ${shape} there. ` +
        'Nothing was guessed and nothing was changed.',
      500,
    )
  }
  return said as Record<string, unknown>
}

const anIdOrNull = (value: unknown): boolean => value === null || (typeof value === 'string' && value !== '')
const aTextOrNull = (value: unknown): boolean => value === null || typeof value === 'string'

function theStoredReceiver(): AStoredReceiver | null {
  const value = theStoredValue(USAGE_NOTICE_SECRETARY_SETTING, ['secretary', 'because'], '{"secretary": an agent\'s id or null, "because": a reason or null}', (one) => anIdOrNull(one['secretary']) && aTextOrNull(one['because']))
  return value === null ? null : { secretary: value['secretary'] as string | null, because: value['because'] as string | null }
}

function theStoredDecision(): AStoredDecision | null {
  const value = theStoredValue(
    USAGE_DECISION_SETTING,
    ['whatToDo', 'decision', 'because'],
    '{"whatToDo": words or null, "decision": a record id or null, "because": a reason or null}, with the words and the id both set or both null',
    (one) => anIdOrNull(one['whatToDo']) && anIdOrNull(one['decision']) && (one['whatToDo'] === null) === (one['decision'] === null) && aTextOrNull(one['because']),
  )
  return value === null ? null : { whatToDo: value['whatToDo'] as string | null, decision: value['decision'] as string | null, because: value['because'] as string | null }
}

/**
 * EVERY SECRETARY THAT CAN TAKE THE NOTICES, FIRST APPOINTED FIRST: by the time its agent was registered, then by id.
 * The secretaries are the un-retired holders of the secretary card that the secretariat names.
 */
function theSecretariesInTheOrderAppointed(): AUsageNoticeChoice[] {
  const ids = theSecretaries().map((one) => one.id)
  if (ids.length === 0) return []
  return sqlite.prepare(`SELECT id, handle, name FROM agents WHERE id IN (${ids.map(() => '?').join(', ')}) ORDER BY created_at, id`).all(...ids) as AUsageNoticeChoice[]
}

/** Why this agent cannot take the notices, when it is not among the secretaries that can. */
function whyThisAgentCannotTakeThem(row: RegisteredAgent | null): WhyTheChosenCannotTakeThem {
  if (row === null) return 'not registered'
  return row.retired ? 'retired' : 'not a secretary'
}

function theReceiverInForce(stored: AStoredReceiver | null, inOrder: readonly AUsageNoticeChoice[]): TheUsageNoticeSecretaryInForce {
  let chosen: AChosenWhoCannot | null = null
  if (stored !== null && stored.secretary !== null) {
    const found = inOrder.find((one) => one.id === stored.secretary)
    if (found !== undefined) return { from: 'set here', agent: found }
    const row = readParticipant({ kind: 'agent', id: stored.secretary }) as RegisteredAgent | null
    chosen = { stored: stored.secretary, storedName: row?.name || row?.handle || stored.secretary, cannotBecause: whyThisAgentCannotTakeThem(row) }
  }
  const first = inOrder[0]
  return first === undefined ? { from: 'no secretary', chosen } : { from: 'the first secretary appointed', agent: first, chosen }
}

const nameOf = (agent: AUsageNoticeChoice): string => agent.name || agent.handle

/** The English sentence for a reading of who takes the notices. */
function theReceiverSentence(inForce: TheUsageNoticeSecretaryInForce): string {
  if (inForce.from === 'set here') return sayInEnglish('usageNotices.secretary.setHere', { who: nameOf(inForce.agent) })
  if (inForce.from === 'no secretary') {
    return inForce.chosen === null
      ? sayInEnglish('usageNotices.secretary.noSecretary')
      : sayInEnglish('usageNotices.secretary.chosenAndNoSecretary', { chosen: inForce.chosen.storedName })
  }
  const who = nameOf(inForce.agent)
  if (inForce.chosen === null) return sayInEnglish('usageNotices.secretary.firstAppointed', { who })
  const chosen = inForce.chosen.storedName
  switch (inForce.chosen.cannotBecause) {
    case 'retired':
      return sayInEnglish('usageNotices.secretary.chosenRetired', { chosen, who })
    case 'not a secretary':
      return sayInEnglish('usageNotices.secretary.chosenNotASecretary', { chosen, who })
    case 'not registered':
      return sayInEnglish('usageNotices.secretary.chosenNotRegistered', { chosen, who })
  }
}

/** WHO TAKES THE USAGE NOTICES NOW, OR WHY NOBODY DOES, with the secretaries that may be chosen. The one reader. */
export function theUsageNoticeSecretary(): TheUsageNoticeSecretary {
  const stored = theStoredReceiver()
  const mayBeChosen = theSecretariesInTheOrderAppointed()
  const inForce = theReceiverInForce(stored, mayBeChosen)
  return { inForce, stored: stored?.secretary ?? null, everSet: stored !== null, because: stored?.because ?? null, says: theReceiverSentence(inForce), mayBeChosen }
}

/**
 * THE SECRETARY THE NEXT USAGE NOTICE GOES TO, or null because this office has no secretary. `whyThisSecretary` is the
 * reading's sentence when the notice goes to the first appointed because the agent chosen cannot take it, and null
 * otherwise. The notice ends with it.
 */
export function whoTakesTheNextUsageNotice(): { secretary: ParticipantRef; whyThisSecretary: string | null } | null {
  const reading = theUsageNoticeSecretary()
  const inForce = reading.inForce
  if (inForce.from === 'no secretary') return null
  const instead = inForce.from === 'the first secretary appointed' && inForce.chosen !== null
  return { secretary: { kind: 'agent', id: inForce.agent.id }, whyThisSecretary: instead ? reading.says : null }
}

/**
 * WHO THE CHANGE ROW NAMES. A registered agent is named by its registry id, not by the handle the request was sent
 * under, so the row still names the same agent after a rename. Any other caller is named as the request named it, as
 * on every other setting's row. The doors let only the owner or a registered secretary get this far.
 */
function theActorTheRowNames(actor: Actor): Actor {
  const who = participantForActor(actor)
  return who?.kind === 'agent' ? { ...actor, id: who.id } : actor
}

/**
 * CHOOSE WHO TAKES THE USAGE NOTICES, OR NOBODY, AND ANSWER WITH THE READING. `id` is a registry id the door already
 * resolved, or null for nobody, which leaves the notices with the first secretary appointed. The door has already
 * checked who is asking and whether a reason is needed. Only a secretary that can take them now may be chosen.
 */
export function setTheUsageNoticeSecretary(actor: Actor, id: string | null, because: string | null, workspaceId: string): TheUsageNoticeSecretary {
  if (id !== null && !theSecretariesInTheOrderAppointed().some((one) => one.id === id)) {
    const row = readParticipant({ kind: 'agent', id }) as RegisteredAgent | null
    const name = row?.name || row?.handle || id
    const why = whyThisAgentCannotTakeThem(row)
    throw new PanelError(
      `${why === 'not registered' ? `"${name}" is not a registered agent here` : why === 'retired' ? `${name} is retired` : `${name} does not hold the secretary card`}, ` +
        'so it cannot take the usage notices. GET /api/office/usage-notice-secretary lists the secretaries that may. Nothing was changed.',
      400,
    )
  }
  const before = theStoredReceiver()
  writeDownASettingChange(theActorTheRowNames(actor), { setting: USAGE_NOTICE_SECRETARY_SETTING, field: 'who takes the usage notices', before, after: { secretary: id, because }, workspaceId })
  return theUsageNoticeSecretary()
}

/** The words and the decision's id set here, or null because none are set. The reading and the notice both start from it. */
function theWordsSetHere(stored: AStoredDecision | null): { decision: string; whatToDo: string } | null {
  if (stored === null || stored.whatToDo === null || stored.decision === null) return null
  return { decision: stored.decision, whatToDo: stored.whatToDo }
}

/**
 * THE TITLE OF THE DECISION THE WORDS COME FROM, as its record has it now. A record deleted since the words were set
 * still has its title. No record is ever taken out of the table, so an id that names none is a broken setting, and the
 * reading refuses rather than draw the id in its place.
 */
function theTitleOfTheDecision(id: string): string {
  const record = getRecord(id)
  if (record === null) {
    throw new PanelError(`The usage decision setting names the record "${id}", and no record here has that id, so its title cannot be read. Nothing was guessed.`, 500)
  }
  return record.title
}

function theDecisionInForce(stored: AStoredDecision | null): TheUsageDecisionInForce {
  const set = theWordsSetHere(stored)
  if (set === null) return { from: 'not set' }
  return { from: 'set here', whatToDo: set.whatToDo, decision: set.decision, title: theTitleOfTheDecision(set.decision) }
}

/** WHAT THE NOTICE AT 80% SAYS TO DO NOW, OR THAT NOTHING IS SET. The one reader. Its sentence names the decision by its title. */
export function theUsageDecision(): TheUsageDecision {
  const stored = theStoredDecision()
  const inForce = theDecisionInForce(stored)
  return {
    inForce,
    everSet: stored !== null,
    because: stored?.because ?? null,
    says: inForce.from === 'set here' ? sayInEnglish('usageNotices.decision.setHere', { title: inForce.title, whatToDo: inForce.whatToDo }) : sayInEnglish('usageNotices.decision.notSet'),
  }
}

/**
 * The words and the decision's id the notice at 80% says, or null because none are set. The notice names the decision
 * by its id, so it does not read the record.
 */
export function whatTheUsageDecisionSaysToDo(): { decision: string; whatToDo: string } | null {
  return theWordsSetHere(theStoredDecision())
}

/**
 * SET THE WORDS OF THE USAGE DECISION AND THE DECISION THEY COME FROM, OR NEITHER, AND ANSWER WITH THE READING. The door
 * has already checked who is asking. The words and the id come together or not at all, the words are at most
 * `WHAT_TO_DO_MOST` characters, and the id must name a decision record that is not deleted.
 */
export function setTheUsageDecision(actor: Actor, whatToDo: string | null, decision: string | null, because: string | null, workspaceId: string): TheUsageDecision {
  if ((whatToDo === null) !== (decision === null)) {
    throw new PanelError('Send the words of the usage decision and the id of the decision they come from together, or both as null. Nothing was changed.', 400)
  }
  if (whatToDo !== null && whatToDo.length > WHAT_TO_DO_MOST) {
    throw new PanelError(`The words of the usage decision have ${String(whatToDo.length)} characters, and they may have ${String(WHAT_TO_DO_MOST)}. Nothing was changed.`, 400)
  }
  if (decision !== null) {
    const record = getRecord(decision)
    if (record === null || record.kind !== 'decision' || record.deletedAt !== null) {
      throw new PanelError(
        `"${decision}" ${record === null ? 'is not a record here' : record.deletedAt !== null ? 'is a deleted record' : `is ${withArticle(kindWord(record.kind).text)}, not a decision`}, ` +
          'so the words cannot come from it. Nothing was changed.',
        400,
      )
    }
  }
  const before = theStoredDecision()
  writeDownASettingChange(theActorTheRowNames(actor), { setting: USAGE_DECISION_SETTING, field: 'what the usage notice at 80% says to do', before, after: { whatToDo, decision, because }, workspaceId })
  return theUsageDecision()
}
