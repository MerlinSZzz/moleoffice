// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFICE'S BACKUPS, AS TWO DOORS: THE LIST, AND ONE BACKUP TAKEN NOW.
 *
 *   GET  /api/office/backups             every backup in the backups folder, with what made it, its time and its size
 *   POST /api/office/backups             take one backup now, as `npm run db:backup` takes it, into the same folder
 *   POST /api/office/backups/hand-over   ask the host job runner to hand one complete backup to the lab server
 *
 * ---------------------------------------------------------------------------------------
 * WHO MAY
 * ---------------------------------------------------------------------------------------
 *
 * The person or a secretary, by the check the settings door asks for the gates that say
 * `the-person-or-a-secretary`: the person proved, the owner's authority in a test world, or a secretary
 * proved by its own key. Both doors ask it. The list names every copy of the office's whole history.
 *
 * ---------------------------------------------------------------------------------------
 * THE SAME CODE AS THE COMMAND
 * ---------------------------------------------------------------------------------------
 *
 * The take calls `takeTheBackup` of src/server/lib/backup.ts, as `npm run db:backup` does, with the
 * database this server opened as the source, which its database client opened only after
 * `whyThisCheckoutMayNotOpenTheDatabase` let it. It writes the database and the folders a backup carries,
 * and it runs in a thread of its own so the server goes on answering. The name says this door took it,
 * from `backupNameFor` in src/server/lib/complete-backups.ts, where the list reads it back.
 *
 * THE DATABASE THIS SERVER OPENED, AND ITS BACKUPS FOLDER. Both doors work them out from the file the database
 * client has open, as the update press does (src/server/lib/the-update.ts), and not from the settings, which are
 * read again from the environment on every call and can name another file by then.
 *
 * ONE AT A TIME. A press while a backup is being taken is refused. Two copies of one database at once
 * would only make the first one slower.
 *
 * A NAME OF ITS OWN FOR EVERY PRESS. A press in the same second as the backup before it would find that
 * backup's name taken, and the library refuses a taken name. So it takes the name with the next number,
 * `-2` and up, and the backup is still dated by its second.
 *
 * THE HAND-OVER IS A THIRD DOOR, and it takes the same caller as the other two. It names one complete
 * backup in the same folder and no path, command, destination or server. The office files the host job
 * itself, as the office, with the caller on it, and answers at once. The tool that does the hand-over
 * is a registered host tool. While it is not registered the job carries no digest and runs nothing.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { backupsDirectoryOf } from '../../config/settings.mjs'
import { filesFolderOf, leftOutListOf } from '../../shared/what-is-kept.ts'
import { sqlite } from '../db/client.ts'
import { theBackupsInTheFolder, takeTheBackupInItsOwnThread } from '../lib/backup.ts'
import { fileTheBackupHandOver, ONLY_THE_PERSON_OR_A_SECRETARY } from '../lib/backup-hand-over.ts'
import { backupNameFor } from '../lib/complete-backups.ts'
import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { PanelError } from '../lib/panel-error.ts'
import { route } from '../lib/route.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { mayChangeTheOfficesSettings } from './runtime-settings.ts'

const LIST_NOTE =
  'Every backup in the office\'s backups folder, newest first. Each says what made it, read from its name: ' +
  'the-backup-command (npm run db:backup), the-door (POST /api/office/backups) or the-update (the update press), ' +
  'or null when the name does not say. Each has its time, from its name or from its file, and its size in bytes ' +
  'with its files folder and its left-out list. A backup that is not complete is listed with the reason. ' +
  'folderExists is false when there is no backups folder yet. The person or a secretary with its own key may read it.'

const TAKE_NOTE =
  'Take one backup of this office\'s database now, with the code of npm run db:backup: the database and the ' +
  'folders a backup carries, verified, into the backups folder, under a name that says this door took it. No body ' +
  'is read. The reply comes when the backup is done, with its row of the list and what the backup reported. One ' +
  'backup at a time: a press while one is being taken is refused. A press in the same second as the backup before it ' +
  'takes its own, named with -2 and up after the ending. The person or a secretary with its own key may press it.'

const HAND_OVER_NOTE =
  'Hand one complete backup to the lab server. Body {"backup":"<the backup\'s name in this office\'s backups folder>"} ' +
  'and nothing else: a path, a command, a destination or a server name is refused. The office files the host job ' +
  'itself, as the office, with askedBy naming the caller and the backup\'s name as its only argument, and answers 201 ' +
  'at once. The job names the registered host tool that does the hand-over; while that tool is not registered, ' +
  'nothing runs. The person or a secretary with its own key may ask.'

/** The ask takes one key and no other. */
const aHandOver = z.object({ backup: z.unknown() }).strict()

/** The name of the backup being taken now, or null. Module state, so it is this server's alone. */
let beingTaken: string | null = null

/** The door's name for a backup taken now, the first whose database, files folder and left-out list are all free. */
function aNameOfItsOwn(directory: string, now: Date): string {
  for (let nth = 1; ; nth += 1) {
    const name = backupNameFor('the-door', now, nth)
    if (![name, filesFolderOf(name), leftOutListOf(name)].some((one) => existsSync(join(directory, one)))) return name
  }
}

export async function backupRoutes(app: FastifyInstance): Promise<void> {
  app.get('/office/backups', route('office.backups', 'remote', LIST_NOTE), async (req) => {
    if (!mayChangeTheOfficesSettings(actorFrom(req))) {
      throw new PanelError('Only the person or a secretary with its own key may read the list of backups. Nothing was read.', 403)
    }
    return theBackupsInTheFolder(backupsDirectoryOf(sqlite.name))
  })

  app.post('/office/backups', route('office.take-a-backup', 'remote', TAKE_NOTE), async (req, reply) => {
    if (!mayChangeTheOfficesSettings(actorFrom(req))) {
      throw new PanelError('Only the person or a secretary with its own key may take a backup. Nothing was taken.', 403)
    }
    if (beingTaken !== null) {
      throw new PanelError('A backup is being taken now, by an earlier press. This press took none. Read the list of backups when that one is done.', 409)
    }
    const directory = backupsDirectoryOf(sqlite.name)
    const name = aNameOfItsOwn(directory, new Date())
    beingTaken = name
    try {
      const taken = await takeTheBackupInItsOwnThread(sqlite.name, join(directory, name), false)
      if (!taken.taken) throw new PanelError(`The backup was not taken. ${taken.said}`, 500)
      const backup = theBackupsInTheFolder(directory).backups.find((one) => one.name === name)
      void reply.code(201)
      return { backup: backup ?? null, taken }
    } finally {
      beingTaken = null
    }
  })

  app.post('/office/backups/hand-over', route('office.hand-over-a-backup', 'remote', HAND_OVER_NOTE), async (req, reply) => {
    const actor = actorFrom(req)
    if (!mayChangeTheOfficesSettings(actor)) throw new PanelError(ONLY_THE_PERSON_OR_A_SECRETARY, 403)
    const said = parse(aHandOver, req.body, 'The hand-over')
    const job = fileTheBackupHandOver(said.backup, actor, workspaceOf(req))
    void reply.code(201)
    return { job }
  })
}
