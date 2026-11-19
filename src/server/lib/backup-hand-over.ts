// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE BACKUP HAND-OVER: ONE COMPLETE BACKUP, CHOSEN FROM THE FOLDER, AND THE OFFICE'S OWN HOST JOB.
 *
 * The door is POST /api/office/backups/hand-over (src/server/api/backups.ts). The person, or an agent
 * holding the secretary card, names one complete backup in this office's backups folder. The request
 * carries no path, command, destination or server name: the tool that does the hand-over builds all of
 * them from the backup's own name and date.
 *
 * THE OFFICE FILES THE JOB ITSELF, as itself. A person has no run, so this door is the one that checks
 * who may ask and then files the job. `askedBy` names the caller by its kind and id, and the backup's
 * name is the job's only argument. POST /api/host-jobs is not widened: it still takes only a running
 * agent run.
 *
 * THE TOOL'S DIGEST COMES FROM THE REGISTER. The job names THE_HAND_OVER_TOOL and carries the
 * program's sha256 when the tool is registered, so a runner has something to start and to check.
 * While the tool is not registered the job carries no digest, which the take reads as a job with
 * nothing to start; filing the job then runs nothing.
 *
 * A BACKUP IS READ FROM THE FOLDER, NEVER FROM ITS NAME ALONE. The name must be one the folder lists,
 * and that row must be complete: a SQLite database with its files folder or its left-out list beside
 * it. A name that is not listed, a copy that is not complete, and a name changed from a real one are
 * each refused before anything is written.
 */
import { readCompleteBackups } from './complete-backups.ts'
import { THE_HAND_OVER_TOOL } from '../../shared/backup-hand-over.ts'
import { asTheHostJobWriter } from './host-job-door.ts'
import { theRegisteredHostTool } from './host-jobs.ts'
import { THE_OFFICE } from './the-office.ts'
import { theAgentTheKeyProves } from './the-agent-the-key-proves.ts'
import { createRecordWithReport, type Actor } from './records.ts'
import { PanelError } from './panel-error.ts'
import { HOST_JOB_KIND, type HostJobState } from '@shared/host-jobs.ts'
import { THE_PERSON } from '@shared/person.ts'
import { nowStamp } from '@shared/time.ts'
import type { PanelRecord } from '@shared/types.ts'
import { backupsDirectoryOf } from '../../config/settings.mjs'
import { THE_HAND_OVER_ARGUMENT } from '../../shared/backup-hand-over.ts'
import { sqlite } from '../db/client.ts'

/** The one sentence an agent that is not the person and holds no secretary card is refused with. */
export const ONLY_THE_PERSON_OR_A_SECRETARY =
  'Only the person or a secretary with its own key may hand a backup over, and this request wrote nothing.'

/** What a request that does not name one backup is told. */
export const A_BACKUP_MUST_BE_NAMED =
  '"backup" must be the name of one complete backup in this office\'s backups folder. Nothing was written.'

/** What a request is told when there is no backups folder yet. */
export const NO_BACKUPS_FOLDER =
  'This office has no backups folder yet, so there is no complete backup to hand over. Nothing was written.'

/** The refusal of a name the backups folder does not list. */
export function notOneOfThisOfficesBackups(name: string): string {
  return `"${name}" is not one of this office's backups, so nothing is handed over. Read them at GET /api/office/backups. Nothing was written.`
}

/** The refusal of a listed backup that is not complete, with the reason the list gives. */
export function thisBackupIsNotComplete(name: string, reason: string): string {
  return `"${name}" is in the backups folder but is not complete: ${reason}. Nothing was handed over, and nothing was written.`
}

/**
 * THE ONE BACKUP THIS REQUEST NAMES, as the folder reads it now. A name that is not a string, a name
 * the folder does not list, and a listed copy that is incomplete are each refused by name. Reading the
 * folder is local and bounded; nothing waits for a runner or for a server.
 */
export function theBackupToHandOver(backup: unknown): string {
  if (typeof backup !== 'string' || backup === '') throw new PanelError(A_BACKUP_MUST_BE_NAMED, 400)
  const directory = backupsDirectoryOf(sqlite.name)
  let found: ReturnType<typeof readCompleteBackups>
  try {
    found = readCompleteBackups(directory)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw new PanelError(NO_BACKUPS_FOLDER, 400)
    throw err
  }
  const reading = [...found.backups, ...found.unstamped].find((one) => one.entry.name === backup)
  if (reading === undefined) throw new PanelError(notOneOfThisOfficesBackups(backup), 400)
  if (!reading.complete) throw new PanelError(thisBackupIsNotComplete(backup, reading.reason), 400)
  return backup
}

/**
 * WHO ASKED, in the shape the job keeps: the person, or the agent the key proves. An actor holding
 * the owner's authority in a test world is an agent, and its own row names it.
 */
function theCaller(actor: Actor): { kind: 'person' | 'agent'; id: string } {
  if (actor.type === 'human') return { kind: 'person', id: THE_PERSON }
  return { kind: 'agent', id: theAgentTheKeyProves(actor) ?? actor.id }
}

/**
 * File the hand-over job, as the office, and answer with it. Nothing runs: the job names a tool that
 * is not registered and carries no program digest, so a runner that takes it finds nothing to start.
 */
export function fileTheBackupHandOver(backup: unknown, actor: Actor, workspaceId: string): PanelRecord {
  const name = theBackupToHandOver(backup)
  const declared = theRegisteredHostTool(THE_HAND_OVER_TOOL)
  return sqlite.transaction(() =>
    asTheHostJobWriter(() =>
      createRecordWithReport({
        kind: HOST_JOB_KIND,
        title: `Host job: ${THE_HAND_OVER_TOOL}`,
        workspaceId,
        data: {
          tool: THE_HAND_OVER_TOOL,
          ...(declared === null ? {} : { sha256: declared.program.sha256 }),
          arguments: { [THE_HAND_OVER_ARGUMENT]: name },
          askedBy: theCaller(actor),
          state: 'asked' satisfies HostJobState,
          askedAt: nowStamp(),
        },
        actor: THE_OFFICE,
        bindCallerSession: false,
        namesWhatIsAlreadyFiled: false,
      }),
    ),
  )().record
}
