// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `revocationOf` was moved byte for byte out of src/server/lib/warrants.ts, with no change of behaviour.
 * `said` was moved byte for byte out of src/server/lib/warrants.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { and, eq } from 'drizzle-orm'
import { db } from './client.ts'
import { revisions } from './schema.ts'
import { whoRevokedIt } from '@shared/warrant.ts'
import type { ActOnTheirWords } from './types/warrants.ts'

/** The later revision that took this act back, when there is one. The period's list asks it too (lib/elevation.ts). */
export function revocationOf(recordId: string, seq: number): ActOnTheirWords['revoked'] {
  const row = db
    .select({ at: revisions.at, actorType: revisions.actorType, actorId: revisions.actorId })
    .from(revisions)
    .where(and(eq(revisions.recordId, recordId), eq(revisions.revokesSeq, seq)))
    .get()
  if (row === undefined) return null
  return {
    at: row.at,
    actorType: row.actorType,
    actorId: row.actorId,
    said: whoRevokedIt({ revokedByType: row.actorType, revokedById: row.actorId, revokedAt: row.at }),
  }
}
/** One side of a change, in words. `nothing` is the honest word for a field that was not there. */
export function said(value: unknown): string {
  if (value === undefined || value === null || value === '') return 'nothing'
  return typeof value === 'string' ? value : JSON.stringify(value)
}
