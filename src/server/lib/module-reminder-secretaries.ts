// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHO IS REMINDED ABOUT EACH PROJECT'S MODULES: THE ONE READER, AND THE ONE WRITER. Wave 13p round 29, on decision
 * aZGg6gerakM1 (one secretary per project is reminded about the modules left unchanged for 14 days).
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO PLACES A CHOICE CAN COME FROM, AND WHICH ONE COUNTS
 * ---------------------------------------------------------------------------------------
 *
 * 1. SET HERE: the column `workspaces.module_reminder_secretary` (migration 0211), one agent's registry id per
 *    project, chosen on the Settings page.
 * 2. THE .ENV LINE: MOLE_OFFICE_MODULE_REMINDER_SECRETARIES, project=handle pairs, read by
 *    `moduleReminderSecretaries` in lib/env.ts.
 *
 * A choice set here comes first. The .env line counts for a project only when nothing is set here for it. When
 * something is set here and that agent cannot be reminded now (not registered, retired, or no longer holding the
 * secretary card), the answer is nobody, with the reason. The .env line is not used in its place, because the person
 * chose here and a quiet fall back would remind somebody they did not choose.
 *
 * A .ENV LINE THAT CANNOT BE READ IS SAID, NOT THROWN. The reading carries the sentence the env reader threw, and
 * every project that has nothing set here says the line cannot be read. The record-duty check in
 * lib/stale-records.ts still stops on it, loudly, when a project needs it.
 *
 * NOTHING IS CACHED. Every reading reads the rows, the .env line and the registry again, so a press on the Settings
 * page reaches the very next reminder tick.
 *
 * ---------------------------------------------------------------------------------------
 * WHO MAY CHANGE IT
 * ---------------------------------------------------------------------------------------
 *
 * The door in api/module-reminder-secretaries.ts decides that, before this writer is called: the person with a
 * press, or a secretary with its own key and a reason. No other agent.
 */

import { sayInEnglish } from '@shared/i18n.ts'
import { sqlite } from '../db/client.ts'
import { moduleReminderSecretaries } from './env.ts'
import { type RegisteredAgent } from './participants.ts'
import { readParticipant } from '../db/read-participant.ts'
// PanelError, SO THE SENTENCE REACHES WHOEVER ASKED. Only built when the writer refuses, never at import.
import { PanelError } from './panel-error.ts'
import { theSecretaries } from './secretariat.ts'
import { listWorkspaces } from '../db/list-workspaces.ts'

/** One agent as the panel offers it and as a reading names it. */
export interface AModuleReminderSecretary {
  id: string
  handle: string
  name: string
}

/** Why the agent set here cannot be reminded now. */
export type WhyTheAgentSetHereCannotBeReminded = 'not registered' | 'retired' | 'not a secretary'

/**
 * WHAT IS IN FORCE FOR ONE PROJECT, AND WHERE IT CAME FROM.
 *
 *   set here                  an agent is set here and can be reminded: `agent`.
 *   set here, cannot remind   an agent is set here and cannot be reminded now: `stored`, `storedName`, `because`.
 *   from the .env line        nothing is set here and the .env line names a handle: `handle`.
 *   .env line unreadable      nothing is set here and the .env line cannot be read.
 *   nobody named              nothing is set here and the .env line names nobody for this project.
 */
export type TheModuleReminderSecretaryInForce =
  | { from: 'set here'; agent: AModuleReminderSecretary }
  | { from: 'set here, cannot remind'; stored: string; storedName: string; cannotBecause: WhyTheAgentSetHereCannotBeReminded }
  | { from: 'from the .env line'; handle: string }
  | { from: '.env line unreadable' }
  | { from: 'nobody named' }

/** One project's row of the reading. */
export interface AProjectsModuleReminderSecretary {
  project: string
  title: string
  inForce: TheModuleReminderSecretaryInForce
  /** The registry id stored here for the project, exactly, or null because nothing is set here. */
  storedHere: string | null
  /** The reason given with the last change made here, or null because none was given or nothing was changed here. */
  because: string | null
  /** The handle the .env line names for this project, or null because it names none or cannot be read. */
  envNames: string | null
  /** The reading in one English sentence. The page says the same from the same word keys. */
  says: string
}

/** What the .env line says, read once for a whole reading. */
export type TheEnvLine =
  | { readable: true; named: Record<string, string> }
  | { readable: false; why: string }

/** The whole reading: every project, the .env line, the projects it names that do not exist, and who may be chosen. */
export interface TheModuleReminderSecretaries {
  projects: AProjectsModuleReminderSecretary[]
  envLine: TheEnvLine
  /** Projects the .env line names that are not projects here, in the order the line names them. */
  envNamesUnknownProjects: string[]
  /** Every un-retired holder of the secretary card, in registry order. The panel offers these. */
  mayBeChosen: AModuleReminderSecretary[]
}

/** One registry row as the panel offers it. */
function asChoice(row: RegisteredAgent): AModuleReminderSecretary {
  return { id: row.id, handle: row.handle, name: row.name }
}

/**
 * THE .ENV LINE, OR WHY IT CANNOT BE READ. The env reader throws on a line that is not project=handle pairs; that
 * one sentence is kept and carried, and nothing else is caught.
 */
function theEnvLine(): TheEnvLine {
  try {
    return { readable: true, named: Object.fromEntries(moduleReminderSecretaries()) }
  } catch (error) {
    if (!(error instanceof Error) || !error.message.startsWith('MOLE_OFFICE_MODULE_REMINDER_SECRETARIES')) throw error
    return { readable: false, why: error.message }
  }
}

/** Why this agent cannot be reminded about modules now, or null because it can. The writer and the reader ask this. */
function whyThisAgentCannotBeReminded(id: string): WhyTheAgentSetHereCannotBeReminded | null {
  const row = readParticipant({ kind: 'agent', id }) as RegisteredAgent | null
  if (row === null) return 'not registered'
  if (row.retired) return 'retired'
  if (!theSecretaries().some((one) => one.id === id)) return 'not a secretary'
  return null
}

/** The English sentence for one project's reading. The page says the same from the same word keys. */
function theSentence(inForce: TheModuleReminderSecretaryInForce): string {
  switch (inForce.from) {
    case 'set here':
      return sayInEnglish('moduleReminders.inForce.setHere', { who: inForce.agent.name || inForce.agent.handle })
    case 'set here, cannot remind':
      if (inForce.cannotBecause === 'not registered') return sayInEnglish('moduleReminders.inForce.setHereNotRegistered', { who: inForce.storedName })
      if (inForce.cannotBecause === 'retired') return sayInEnglish('moduleReminders.inForce.setHereRetired', { who: inForce.storedName })
      return sayInEnglish('moduleReminders.inForce.setHereNotASecretary', { who: inForce.storedName })
    case 'from the .env line':
      return sayInEnglish('moduleReminders.inForce.fromEnv', { who: inForce.handle })
    case '.env line unreadable':
      return sayInEnglish('moduleReminders.inForce.envUnreadable')
    case 'nobody named':
      return sayInEnglish('moduleReminders.inForce.nobody')
  }
}

/** What one project's row holds here, exactly as SQLite hands it over. */
function theStoredRow(project: string): { who: unknown; because: unknown } | undefined {
  return sqlite
    .prepare('SELECT module_reminder_secretary AS who, module_reminder_secretary_because AS because FROM workspaces WHERE id = ?')
    .get(project) as { who: unknown; because: unknown } | undefined
}

/** What is in force for one project, given what is stored here and what the .env line says. */
function whatIsInForce(project: string, stored: string | null, envLine: TheEnvLine): TheModuleReminderSecretaryInForce {
  if (stored !== null) {
    const why = whyThisAgentCannotBeReminded(stored)
    const row = readParticipant({ kind: 'agent', id: stored }) as RegisteredAgent | null
    if (why === null && row !== null) return { from: 'set here', agent: asChoice(row) }
    return { from: 'set here, cannot remind', stored, storedName: row?.name || row?.handle || stored, cannotBecause: why ?? 'not registered' }
  }
  if (!envLine.readable) return { from: '.env line unreadable' }
  const handle = envLine.named[project]
  return handle === undefined ? { from: 'nobody named' } : { from: 'from the .env line', handle }
}

/**
 * WHO IS REMINDED ABOUT EACH PROJECT'S MODULES, AND WHERE THAT CAME FROM. The one reader: the Settings page reads it
 * through GET /api/office/module-reminder-secretaries, and the record-duty check in lib/stale-records.ts reads it on
 * every tick.
 */
export function theModuleReminderSecretaries(): TheModuleReminderSecretaries {
  const envLine = theEnvLine()
  const projects = listWorkspaces()
  const rows: AProjectsModuleReminderSecretary[] = projects.map((project) => {
    const held = theStoredRow(project.id)
    const stored = held?.who ?? null
    if (stored !== null && (typeof stored !== 'string' || stored === '')) {
      throw new PanelError(
        `The secretary reminded about the modules of ${project.id} is stored as ${JSON.stringify(stored)} in ` +
          "workspaces.module_reminder_secretary, and this office reads only nothing or an agent's id there. Nothing " +
          'was guessed and nothing was changed.',
        500,
        undefined,
        undefined,
        undefined,
        { code: 'moduleReminderSecretaryUnreadable', values: {} },
      )
    }
    const inForce = whatIsInForce(project.id, stored, envLine)
    const because = typeof held?.because === 'string' && held.because !== '' ? held.because : null
    return {
      project: project.id,
      title: project.title,
      inForce,
      storedHere: stored,
      because: stored === null ? null : because,
      envNames: envLine.readable ? (envLine.named[project.id] ?? null) : null,
      says: theSentence(inForce),
    }
  })
  const known = new Set(projects.map((one) => one.id))
  const mayBeChosen = theSecretaries()
    .map((one) => readParticipant(one) as RegisteredAgent | null)
    .filter((row): row is RegisteredAgent => row !== null)
    .map(asChoice)
  return {
    projects: rows,
    envLine,
    envNamesUnknownProjects: envLine.readable ? Object.keys(envLine.named).filter((one) => !known.has(one)) : [],
    mayBeChosen,
  }
}

/**
 * SET THE SECRETARY REMINDED ABOUT ONE PROJECT'S MODULES, OR SET NOTHING HERE, AND ANSWER WITH THE READING.
 *
 * `id` is a registry id the caller already resolved, or null to set nothing here, which hands the project back to
 * the .env line. The caller has already checked who is asking and whether a reason is needed. An agent that cannot
 * be reminded now is refused before anything is written, with the reason.
 */
export function setTheModuleReminderSecretary(
  project: string,
  id: string | null,
  because: string | null,
): TheModuleReminderSecretaries {
  if (!listWorkspaces().some((one) => one.id === project)) {
    throw new PanelError(`There is no project "${project}" here. GET /api/workspaces lists them. Nothing was changed.`, 404, undefined, undefined, undefined, {
      code: 'moduleReminderSecretaryNoSuchProject',
      values: {},
    })
  }
  if (id !== null) {
    const why = whyThisAgentCannotBeReminded(id)
    if (why !== null) {
      const row = readParticipant({ kind: 'agent', id }) as RegisteredAgent | null
      const name = row?.name || row?.handle || id
      const tail =
        ', so it cannot be reminded about modules. Choose an un-retired agent that holds the secretary card. ' +
        'GET /api/office/module-reminder-secretaries lists them. Nothing was changed.'
      if (why === 'retired') {
        throw new PanelError(`${name} is retired${tail}`, 400, undefined, undefined, undefined, { code: 'moduleReminderSecretaryRetired', values: {} })
      }
      if (why === 'not a secretary') {
        throw new PanelError(`${name} does not hold the secretary card${tail}`, 400, undefined, undefined, undefined, {
          code: 'moduleReminderSecretaryNotASecretary',
          values: {},
        })
      }
      throw new PanelError(`"${name}" is not a registered agent here${tail}`, 400, undefined, undefined, undefined, {
        code: 'moduleReminderSecretaryNoSuchAgent',
        values: {},
      })
    }
  }
  sqlite
    .prepare('UPDATE workspaces SET module_reminder_secretary = ?, module_reminder_secretary_because = ? WHERE id = ?')
    .run(id, id === null ? null : because, project)
  return theModuleReminderSecretaries()
}
