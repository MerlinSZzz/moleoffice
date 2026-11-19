// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHICH RUN THE OFFICE FILED FOR A SECRETARY'S design/-ONLY MERGE ENTRY.
 *
 * `submitASecretarysDesignEntry` in ./merge-queue.ts files such a run itself and files the entry on it
 * in the same transaction. The entry names the run (`entry.run`) and the run's seal (`entry.seal`). The
 * test below is the one reading of that tie. Two callers ask it:
 *   - the merge queue's state machine (`isASecretarysDesignEntry` in ./merge-state-machine.ts), which
 *     covers such an entry by the decision in place of a release;
 *   - the data step in src/server/db/secretary-runs-need-no-check.ts, which writes `needsNoCheck` on
 *     such a run filed before the office wrote that field (problem 7zhliUpNgKPx).
 *
 * THIS MODULE OPENS NO DATABASE. The caller hands in its own connection, because a data step runs
 * against the file `npm run db:migrate` opened and may not import anything that opens the server's.
 */
import { THE_OFFICE_WRITER_ID } from '@shared/participants.ts'
import { readNeedsNoCheck, NEEDS_NO_CHECK_RULES } from '@shared/releasing.ts'
import type Database from 'better-sqlite3'

/** The purpose written on a run the office filed for a secretary's design/-only entry, and read by the state machine. */
export const SECRETARY_DOCUMENTS = 'secretary-documents'

/** The one folder a secretary's entry with no run may change. */
export const THE_SECRETARYS_FOLDER = 'design/'

/** The decision that asks no check of a secretary's design/-only entry. */
export const NO_CHECK_OF_A_SECRETARYS_ENTRY = 'madeUpuoadum'

/**
 * THE NAME THE OFFICE WRITES UNDER WHEN IT ACTS ON ITS OWN. `THE_OFFICE` in ./inspection.ts is built
 * from this. It is here so that a data step can compare a stored writer with it without importing
 * a module that opens the server's database.
 */
export const THE_OFFICE_WRITES_AS = { type: 'agent', id: THE_OFFICE_WRITER_ID } as const

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** The stored purpose of a run, or undefined. */
function purposeOf(data: unknown): unknown {
  return isObject(data) && isObject(data['extra']) ? data['extra']['purpose'] : undefined
}

/** A run as the test reads it. */
export interface ARunAsStored {
  id: string
  kind: string
  deletedAt: string | null
  data: Record<string, unknown>
}

/**
 * WHETHER THE OFFICE FILED THIS RUN FOR THE SECRETARY'S design/-ONLY ENTRY THAT NAMES IT. All of these
 * hold, each read from what is stored:
 *   - the run is a session and is not deleted;
 *   - the entry's seal is the run's seal (`data.sealedTip`);
 *   - the run still says the purpose `secretary-documents`;
 *   - the run's first revision was written by the office and already said that purpose. A run anybody
 *     else filed, or that took the purpose later, is not one;
 *   - every path the seal froze is under design/. `sealedPaths` answers that last, and is asked only
 *     when everything above holds. It returns null when the seal holds no git work, which is not one.
 *
 * The run's title is not read.
 */
export function theOfficeFiledThisRunForASecretarysEntry(
  db: Database.Database,
  run: ARunAsStored | null,
  entrySealId: string,
  sealedPaths: () => readonly string[] | null,
): boolean {
  if (run === null || run.deletedAt !== null || run.kind !== 'session') return false
  if (purposeOf(run.data) !== SECRETARY_DOCUMENTS || run.data['sealedTip'] !== entrySealId) return false
  const first = db.prepare('SELECT actor_type AS type, actor_id AS id, data FROM revisions WHERE record_id = ? ORDER BY seq LIMIT 1').get(run.id) as
    | { type: string | null; id: string | null; data: string }
    | undefined
  if (first === undefined || first.type !== THE_OFFICE_WRITES_AS.type || first.id !== THE_OFFICE_WRITES_AS.id) return false
  let firstData: unknown
  try {
    firstData = JSON.parse(first.data)
  } catch {
    return false
  }
  if (purposeOf(firstData) !== SECRETARY_DOCUMENTS) return false
  const paths = sealedPaths()
  return paths !== null && paths.every((path) => path.startsWith(THE_SECRETARYS_FOLDER))
}

/** A take-back is office-filed at creation, tied to this problem and this seal, and limited to its paths. */
export function theOfficeFiledThisRunForATakeBack(db: Database.Database, run: ARunAsStored | null, entrySealId: string, problem: string, paths: readonly string[], sealedPaths: () => readonly string[] | null): boolean {
  if (run === null || run.deletedAt !== null || run.kind !== 'session' || run.data['state'] !== 'finished') return false
  const isPurpose = (data: unknown) => isObject(data) && purposeOf(data) === 'take-back' && isObject(data['extra']) && data['extra']['problem'] === problem
  if (!isPurpose(run.data) || run.data['sealedTip'] !== entrySealId || readNeedsNoCheck(run.data['needsNoCheck'])?.rule !== NEEDS_NO_CHECK_RULES[0]) return false
  const first = db.prepare('SELECT actor_type AS type, actor_id AS id, data FROM revisions WHERE record_id = ? ORDER BY seq LIMIT 1').get(run.id) as { type: string; id: string; data: string } | undefined
  if (first === undefined || first.type !== THE_OFFICE_WRITES_AS.type || first.id !== THE_OFFICE_WRITES_AS.id) return false
  try { if (!isPurpose(JSON.parse(first.data))) return false } catch { return false }
  const sealed = sealedPaths()
  return sealed !== null && sealed.every(path => paths.includes(path))
}
