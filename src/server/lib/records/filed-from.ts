// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHO FILED A RECORD, AND FROM WHICH RUN, with the model that run was started on. It was moved whole
 * out of src/server/lib/records.ts, with no change of behaviour.
 *
 * NO CALLER CHANGED. records.ts hands both names on with `export *`, and every caller still imports
 * them from records.ts.
 *
 * THIS FILE IMPORTS records.ts FOR `sessionsIn` AND THE `SessionInRows` TYPE. Every reference this
 * file makes to records.ts is inside a function body, and the type is erased, so the cycle is safe;
 * records.ts hands this module on where the change log already sits.
 */
import { and, asc, eq, sql } from 'drizzle-orm'
import { db } from '../../db/client.ts'
import { changes } from '../../db/schema.ts'
import { type SessionInRows } from '../records.ts'
import { sessionsIn } from '../sessions-in.ts'

/**
 * WHO FILED A RECORD AND FROM WHICH RUN, with the model that run was started on.
 * The create row of the change log, its writer as `whoFiled` reads it, and the run its session names,
 * resolved by `sessionsIn` as the change log resolves it, model included. `run` is null when the create row names
 * no session, which is every record a person typed and any an agent filed outside a run. Null when no create row
 * is recorded at all.
 */
export interface FiledFrom {
  actorType: string
  actorId: string
  run: SessionInRows | null
}

export function whoFiledFromWhichRun(workspaceId: string, recordId: string): FiledFrom | null {
  const made = db
    .select()
    .from(changes)
    // `+workspace_id` FOR THE REASON `changesWhere` GIVES: the record's own index, not a walk of the project.
    .where(and(sql`+${changes.workspaceId} = ${workspaceId}`, eq(changes.recordId, recordId), eq(changes.op, 'create')))
    .orderBy(asc(changes.at))
    .limit(1)
    .get()
  if (made === undefined) return null
  return { actorType: made.actorType, actorId: made.actorId, run: sessionsIn([made], workspaceId)[0] ?? null }
}
