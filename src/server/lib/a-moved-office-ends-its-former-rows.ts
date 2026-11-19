// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A MOVED OFFICE ENDS THE ROWS ITS FORMER PLACE LEFT, BEFORE IT LISTENS.
 *
 * A world's identity is made from the database's place, so an office whose data folder moved starts as a
 * new world. The page still sends its remembered home, the old identity. The office answers that request
 * as "at home, moved", with the moved-home header, only when the worlds table holds the old home as ended
 * (`isADeadHomeOfThisInstallation` in visits.ts, the one place that decides it). Until this step, the old
 * home's row was ended only by the registration after listening (`theRowsLeftByProcessesThatHaveEnded` in
 * register-this-server.ts), and on Windows its process reads take about a second each. On a Windows 11
 * machine on 18 November 2026 the moved office answered with no header from 22:20:53, the row was ended at
 * 22:20:57, and the page showed the banner for another office in between.
 *
 * WHAT IT READS. The live process rows of this project, from the ledger, by SQL. It keeps a row only when
 * its world names this office's port and a database identity other than this office's own, and its process
 * is not this one. Only those processes are read, through `readFirst`, so on Windows no process read holds
 * the server's thread. An office that was not moved has no such row, reads no process and changes nothing.
 * A moved office reads one process for each such row, usually one to three, about a second each on Windows.
 *
 * WHAT IT ENDS. A row whose process is read as 'gone', and nothing else. 'alive' and 'unknown' are left
 * open, so a former home whose office still runs is not ended and still raises the banner. The row is ended
 * through `closeRowThatStoppedMatching`, and the world through the rule it already calls, which ends a world
 * only when no live process row carries its identity.
 *
 * WHEN THE READ FAILS, the start says so in its log and goes on. The rows are then ended by the registration
 * after listening, as before, and the header comes from then.
 */
import type { Actor } from './records.ts'
import { closeRowThatStoppedMatching, listResources, liveKeysOfType, liveRowsOfKey, readFirst, theProcessesAListingReads } from './resources.ts'
import { theWorldThisDatabaseIs } from './world.ts'

export async function endTheRowsAFormerPlaceLeft(opts: { workspaceId: string; port: number; actor: Actor }): Promise<{ ok: boolean; line: string } | null> {
  try {
    const here = theWorldThisDatabaseIs()
    if (here === null) return { ok: true, line: 'start: this database has no identity, so no rows of a former place were looked for.' }
    const left = [...new Set(liveKeysOfType('process'))]
      .filter((key) => key !== String(process.pid))
      .flatMap((key) => liveRowsOfKey({ workspaceId: opts.workspaceId, type: 'process', key }))
      .filter((row) => row.world !== null && row.world.port === opts.port && row.world.databaseIdentity !== here)
    if (left.length === 0) return null
    const ended = await readFirst(
      () => left.flatMap((row) => theProcessesAListingReads({ workspaceId: opts.workspaceId, id: row.id })),
      () => {
        const done: string[] = []
        for (const row of left) {
          const liveness = listResources({ workspaceId: opts.workspaceId, id: row.id })[0]?.liveness
          if (liveness === undefined || liveness.state !== 'gone') continue
          closeRowThatStoppedMatching(row.id, opts.workspaceId, `the process ended, and the next start found it gone before it listened. ${liveness.detail}`, opts.actor)
          done.push(row.key)
        }
        return done
      },
    )
    return { ok: true, line: `start: ${String(left.length)} process rows of another database on this port were read, and ${String(ended.length)} whose process was gone were ended${ended.length === 0 ? '' : ` (${ended.join(', ')})`}.` }
  } catch (error) {
    return { ok: false, line: `start: the rows of another database on this port could not be read before listening, so the registration after listening ends them: ${error instanceof Error ? error.message : String(error)}` }
  }
}
