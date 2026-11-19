// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHETHER THE MESSAGE WORKER STARTS CHECKS IN MERGES-ONLY MODE, AND THE FORK BASES A SEAL IS REFUSED ON: EACH ONE SETTING,
 * READ AND WRITTEN HERE AND NOWHERE ELSE. Wave 13j round loop-1, task "every round ends sealed or says why".
 *
 * WHY. In merges-only mode (MOLE_OFFICE_MESSAGE_WORKER=merges-only) the worker tended the merge tool and started nothing
 * else then, so a seal asked for a check that nothing ran: 13k round 47b sat six hours unchecked. With this control on, the
 * worker in that mode also starts the checks the office asks for, within the limits in @shared/checks-in-merges-only.ts.
 * It is off until somebody switches it on. It is not one of the owner's decided numbers, so a secretary proved by its own
 * key may switch it, with a reason.
 *
 * THE STALE FORK BASES are commits a round's branch must not start from: a seal whose fork base is one of them is
 * refused. NULL is nobody having listed any.
 *
 * WHERE THEY LIVE. Two columns on the installation row, added by migration 0251. Any value other than the ones written
 * here is refused with a 500 that names it, so nothing runs on a reading nobody made.
 *
 * THE PROJECTS IT IS ON FOR live in the office's change log, on the row id `setting:checks-in-merges-only-for`, as how
 * many checks run at once does below: no migration. Every change is one row whose new value is the JSON
 * {"projects": [<project id>, ...] | null, "because": <reason> | null}. The door writes a list whenever it switches the
 * switch on, the project it is switched on from when none is named, and null whenever it switches it off. So a switch
 * that is on with no list was switched on before the switch could name projects, and it is on for every project, as it
 * was then.
 *
 * HOW MANY CHECKS RUN AT ONCE (wave 13j round 14) lives in the office's change log instead, on the row id
 * `setting:checks-at-once`, as the GPU watcher's choice does (lib/gpu-watcher.ts): no migration. Every change is one row
 * whose new value is the JSON {"checksAtOnce": <a whole number within CHECKS_AT_ONCE_BOUNDS> | null, "because": <reason> | null}. The
 * newest row is the value in force, so the value and its history cannot disagree. No row, or a newest row holding null,
 * is the default in @shared/checks-in-merges-only.ts.
 *
 * THE HOLD ON NEW CHECKS AFTER A 5-HOUR LIMIT (wave 13j) is read here too, from the check
 * sessions themselves: no setting, nothing stored. The worker writes a check session's `stopCause` when the check's Claude
 * login answered that its limit is hit. While the reset it named is ahead, a new check on that login waits, with the
 * sentence `theHoldOnNewChecks` makes, and the switch's reading says the same sentence.
 */
import { sqlite } from '../db/client.ts'
import {
  A_FIVE_HOUR_LIMIT_RESETS_WITHIN_MS,
  CHECKS_AT_ONCE_BOUNDS,
  CHECKS_AT_ONCE_BY_DEFAULT,
  theResetOfAFiveHourLimit,
  whatOnMeans,
} from '@shared/checks-in-merges-only.ts'
import { runtimeShownName } from '@shared/participants.ts'
import { whetherAnOfficeWouldStartACheck, type AMessageWorkerMode, type TheChecksSwitch, type WhetherACheckWouldStart } from '@shared/whether-a-check-would-start.ts'
import { momentOfAnInstant, stampInZone, theClockZone } from '@shared/time.ts'
import { theStopCauseOf } from '../../config/a-runs-stop-and-wait.mjs'
import { settingValue } from '../../config/settings.mjs'
import { theSessionIdsAnywhereWhere } from './session-fields.ts'
// PanelError, SO THE SENTENCE REACHES WHOEVER ASKED. Only built when a reader or writer throws, never at import.
import { theLastChangeOfASetting, writeDownASettingChange } from './records/setting-changes.ts'
import type { Actor } from './records.ts'
import { PanelError } from './panel-error.ts'
import { theStaleForkBases } from './the-stale-fork-bases.ts'
import { theStored } from './the-stale-fork-bases.ts'
import { A_FULL_COMMIT } from './the-stale-fork-bases.ts'
import { theHoldOnNewChecks } from './the-hold-on-new-checks.ts'

/** The reading, as the door answers it and the worker reads it. */
export interface ChecksInMergesOnly {
  on: boolean
  /** True when nobody has switched it, and then it is off. */
  nobodyChose: boolean
  /** The projects it is on for, or null: while it is off, or on for every project because it was switched on before it could name any. */
  projects: string[] | null
  says: string
}

export { theStored } from './the-stale-fork-bases.ts'

/** Whether the worker starts checks in merges-only mode, and who chose. Read from the row on every call. */
export function whetherChecksRunInMergesOnly(): ChecksInMergesOnly {
  const stands = theSwitchAsStored()
  const onMeans = whatOnMeans(theChecksAtOnce().checksAtOnce)
  // THE HOLD AFTER A 5-HOUR LIMIT holds every check the worker starts, whichever way the switch stands.
  const held = theHoldOnNewChecks().says
  const andTheHold = held === null ? '' : ` ${held}`
  if (stands.nobodyChose) return { ...stands, says: `Off: nobody has switched it on. When on, ${onMeans}.${andTheHold}` }
  if (stands.on) {
    const projects = stands.projects
    const onFor = projects === null
      ? 'On for every project, because it was switched on before the switch could name projects'
      : `On for ${projects.length === 1 ? projects[0]! : `${projects.slice(0, -1).join(', ')} and ${projects.at(-1)!}`}`
    return { ...stands, says: `${onFor}: ${onMeans}.${andTheHold}` }
  }
  return { ...stands, says: `Off: switched off. When on, ${onMeans}.${andTheHold}` }
}

/**
 * THE SWITCH AS STORED: the installation row's column and the newest change row of its projects, and nothing else. No
 * sentence, no limits and no hold, so a reading that needs only whether checks start reads two rows.
 */
function theSwitchAsStored(): TheChecksSwitch & { projects: string[] | null } {
  const stored = theStored('checks_in_merges_only')
  if (stored === null) return { on: false, nobodyChose: true, projects: null }
  if (stored === 1) return { on: true, nobodyChose: false, projects: theStoredProjects()?.projects ?? null }
  if (stored === 0) return { on: false, nobodyChose: false, projects: null }
  throw new PanelError(
    `Whether checks run in merges-only mode is stored as ${JSON.stringify(stored)} in installation.checks_in_merges_only, and ` +
      'this office reads only nothing, 0 or 1 there. Nothing was guessed and nothing was changed.',
    500,
  )
}

/**
 * WHETHER ANYTHING IN THIS OFFICE WOULD START A CHECK QUEUED IN `project`, NOW (wave 13n round DP). The reading is
 * `whetherAnOfficeWouldStartACheck` in @shared/whether-a-check-would-start.ts, the one the worker's gate makes too. This
 * hands it the message worker's mode, read through the declaration the server reads when it starts the worker
 * (src/config/settings.mjs), and the switch as stored. The hold after a 5-hour limit is not read: a held check starts
 * when the hold ends.
 */
export function whetherThisOfficeWouldStartACheck(project: string): WhetherACheckWouldStart {
  return whetherAnOfficeWouldStartACheck(settingValue('MOLE_OFFICE_MESSAGE_WORKER') as AMessageWorkerMode, theSwitchAsStored, project)
}

/** Switch it on or off, or take the choice away with null, and answer with the reading as it now stands. */
export function setWhetherChecksRunInMergesOnly(on: boolean | null): ChecksInMergesOnly {
  const written = sqlite.prepare('UPDATE installation SET checks_in_merges_only = ? WHERE only_row = 1').run(on === null ? null : on ? 1 : 0)
  if (written.changes !== 1) {
    throw new PanelError('This database has no installation row, so whether checks run in merges-only mode could not be stored. Nothing was changed.', 500)
  }
  return whetherChecksRunInMergesOnly()
}

/** The setting's name in the change log, after `setting:`. */
export const CHECKS_IN_MERGES_ONLY_FOR_SETTING = 'checks-in-merges-only-for'

/** What the newest change row of the projects holds, or null because nobody has named any. A row this office cannot read is refused. */
function theStoredProjects(): { projects: string[] | null; because: string | null } | null {
  const last = theLastChangeOfASetting(CHECKS_IN_MERGES_ONLY_FOR_SETTING)
  if (last === null) return null
  let said: unknown
  try {
    said = last.to === null ? null : JSON.parse(last.to)
  } catch {
    said = undefined
  }
  const choice = said as { projects?: unknown; because?: unknown } | null | undefined
  if (
    typeof choice !== 'object' ||
    choice === null ||
    Object.keys(choice).sort().join(',') !== 'because,projects' ||
    !(choice.projects === null || (Array.isArray(choice.projects) && choice.projects.length > 0 && choice.projects.every((one) => typeof one === 'string' && one !== ''))) ||
    !(choice.because === null || typeof choice.because === 'string')
  ) {
    throw new PanelError(
      `The newest change to the projects checks run in merges-only mode for in the change log holds ${JSON.stringify(last.to)}, ` +
        'and this office reads only {"projects": a list of project ids or null, "because": a reason or null} there. Nothing ' +
        'was guessed and nothing was changed.',
      500,
    )
  }
  return { projects: choice.projects as string[] | null, because: choice.because }
}

/**
 * SET THE PROJECTS IT IS ON FOR, or null while it is off. The door has already checked who asks, the reason and that each
 * project is this office's. A change that changes nothing writes no row (`writeDownASettingChange`).
 */
export function setTheProjectsChecksRunFor(actor: Actor, projects: string[] | null, because: string | null, workspaceId: string | null): void {
  const before = theStoredProjects()
  writeDownASettingChange(actor, {
    setting: CHECKS_IN_MERGES_ONLY_FOR_SETTING,
    field: 'the projects checks run in merges-only mode for',
    before: before === null ? null : { projects: before.projects, because: before.because },
    after: { projects, because },
    workspaceId,
  })
}

/** The setting's name in the change log, after `setting:`. */
export const CHECKS_AT_ONCE_SETTING = 'checks-at-once'

/** How many checks a merges-only worker runs at once, and whether somebody set it or it is the default. */
export interface TheChecksAtOnce {
  checksAtOnce: number
  from: 'the default' | 'set here'
  /** The reason given with the newest change, or null because none was given or nothing was set. */
  because: string | null
}

/** A whole number within the bounds: the only number of checks at once this office stores or reads. */
function isAWholeNumberOfChecks(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= CHECKS_AT_ONCE_BOUNDS.fewest && value <= CHECKS_AT_ONCE_BOUNDS.most
}

/** The bounds in words: `from 1 to 8`. The door says them in its notes and its refusal. */
export const WITHIN_THE_BOUNDS = `from ${String(CHECKS_AT_ONCE_BOUNDS.fewest)} to ${String(CHECKS_AT_ONCE_BOUNDS.most)}`

/** What the newest change row holds, or null because nobody has set it. A row this office cannot read is refused. */
function theStoredChecksAtOnce(): { checksAtOnce: number | null; because: string | null } | null {
  const last = theLastChangeOfASetting(CHECKS_AT_ONCE_SETTING)
  if (last === null) return null
  let said: unknown
  try {
    said = last.to === null ? null : JSON.parse(last.to)
  } catch {
    said = undefined
  }
  const choice = said as { checksAtOnce?: unknown; because?: unknown } | null | undefined
  if (
    typeof choice !== 'object' ||
    choice === null ||
    Object.keys(choice).sort().join(',') !== 'because,checksAtOnce' ||
    !(choice.checksAtOnce === null || isAWholeNumberOfChecks(choice.checksAtOnce)) ||
    !(choice.because === null || typeof choice.because === 'string')
  ) {
    throw new PanelError(
      `The newest change to how many checks run at once in the change log holds ${JSON.stringify(last.to)}, and this office ` +
        `reads only {"checksAtOnce": a whole number ${WITHIN_THE_BOUNDS} or null, "because": a reason or null} there. Nothing was ` +
        'guessed and nothing was changed.',
      500,
    )
  }
  return { checksAtOnce: choice.checksAtOnce, because: choice.because }
}

/** How many checks run at once now. Read from the change log on every call, so a change reaches the next pass. */
export function theChecksAtOnce(): TheChecksAtOnce {
  const stored = theStoredChecksAtOnce()
  if (stored === null || stored.checksAtOnce === null) return { checksAtOnce: CHECKS_AT_ONCE_BY_DEFAULT, from: 'the default', because: stored?.because ?? null }
  return { checksAtOnce: stored.checksAtOnce, from: 'set here', because: stored.because }
}

/**
 * SET HOW MANY CHECKS RUN AT ONCE, or take the choice away with null, and answer with the number as it now stands. The
 * door has already checked who asks and the reason. A change that changes nothing writes no row
 * (`writeDownASettingChange`).
 */
export function setTheChecksAtOnce(actor: Actor, checksAtOnce: number | null, because: string | null, workspaceId: string | null): TheChecksAtOnce {
  if (checksAtOnce !== null && !isAWholeNumberOfChecks(checksAtOnce)) {
    throw new PanelError(`How many checks run at once is a whole number ${WITHIN_THE_BOUNDS}, and ${JSON.stringify(checksAtOnce)} is not. Nothing was changed.`, 400)
  }
  const before = theStoredChecksAtOnce()
  writeDownASettingChange(actor, {
    setting: CHECKS_AT_ONCE_SETTING,
    field: 'how many checks run at once',
    before: before === null ? null : { checksAtOnce: before.checksAtOnce, because: before.because },
    after: { checksAtOnce, because },
    workspaceId,
  })
  return theChecksAtOnce()
}

export { LIMITS_ARE_READ_FOR_MS } from './the-hold-on-new-checks.ts'

/** One login held, or once held, after a check's 5-hour limit: the limit with the latest reset on that login. */
export interface AHoldOnALogin {
  /** The runtime word of the login, as the check's usage receipt names it: `claude-code`. */
  login: string
  /** When the reset falls, in milliseconds since the epoch. */
  until: number
  /** The zone the limit's words named, which the reset is shown in. */
  zone: string
  /** The check session the login answered with the limit. */
  session: string
  workspaceId: string
  /** The run that check was of, or null because the session does not say. */
  checkedRun: string | null
  /** The limit's own words. */
  said: string
  /** The sentence that says the hold, for the worker's queue row and the switch's reading. */
  says: string
}

/** What the hold on new checks is now. */
export interface TheHoldOnNewChecks {
  /** The logins held now, by their runtime word. */
  held: Map<string, AHoldOnALogin>
  /** The logins that held checks in the last day and hold none now, each with the reset that ended the hold. */
  ended: AHoldOnALogin[]
  /** One sentence for each limit of the last five hours that holds nothing, because its reset or its login cannot be told. */
  untold: string[]
  /** What the switch's reading adds: the held sentences, then the untold ones. Null when there are none. */
  says: string | null
}

export { theResetInWords } from './the-hold-on-new-checks.ts'

export { theHoldOnNewChecks } from './the-hold-on-new-checks.ts'

export { A_FULL_COMMIT } from './the-stale-fork-bases.ts'

export { theStaleForkBases } from './the-stale-fork-bases.ts'

/** Replace the list, or take it away with null, and answer with the list as it now stands. */
export function setTheStaleForkBases(bases: string[] | null): string[] {
  if (bases !== null && !bases.every((one) => A_FULL_COMMIT.test(one))) {
    throw new PanelError('A stale fork base is a full commit id: 40 characters, 0 to 9 and a to f. Nothing was changed.', 400)
  }
  const written = sqlite
    .prepare('UPDATE installation SET stale_fork_bases = ? WHERE only_row = 1')
    .run(bases === null ? null : JSON.stringify([...new Set(bases)]))
  if (written.changes !== 1) throw new PanelError('This database has no installation row, so the stale fork bases could not be stored. Nothing was changed.', 500)
  return theStaleForkBases()
}
