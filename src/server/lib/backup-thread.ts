// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE THREAD THAT TAKES ONE BACKUP FOR THE BACKUP DOOR (src/server/api/backups.ts).
 *
 * `takeTheBackupInItsOwnThread` in backup.ts starts this file as a worker thread and is the only thing that talks to
 * it. Read that function first: it says why the backup is taken on a thread of its own.
 *
 * NOTHING RUNS ON IMPORT unless the thread was started with `THE_BACKUP_THREAD` in its `workerData`. Then it calls
 * `takeTheBackup` once, with what that key holds, posts what came back, and ends.
 *
 * A FILE OF ITS OWN, so `npm run bundle` builds it beside server.mjs (THE_THREAD_BUNDLES in src/config/settings.mjs),
 * as it builds the attention thread and the seal-read thread. A bundle carries no tsx to load backup.ts with.
 */

import { parentPort, workerData } from 'node:worker_threads'
import { THE_BACKUP_THREAD, takeTheBackup, type TakeTheBackupAsk } from './backup.ts'

const ask = (workerData as Record<string, unknown> | null)?.[THE_BACKUP_THREAD] as TakeTheBackupAsk | undefined
const port = parentPort
if (port !== null && ask !== undefined) {
  takeTheBackup(ask.source, ask.target, ask.databaseOnly).then(
    (taken) => port.postMessage({ taken }),
    (error: unknown) => port.postMessage({ failed: String((error instanceof Error && error.stack) || error) }),
  )
}
