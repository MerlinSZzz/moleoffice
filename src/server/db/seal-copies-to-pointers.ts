// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * OLD SEALS KEEP WHAT THEY PROVE AND LOSE THEIR COPIES. Criterion C34, migration 0154's data half.
 *
 * DECISION 13, WHICH THIS IS AN EXPLICIT NAMED EXCEPTION UNDER. It REWRITES STORED VALUES: it
 * changes what a seal record's `data` holds. It is declared in tests/migration.test.ts
 * DATA_MIGRATIONS with the columns it may write and why, and that test compares every cell of every
 * table before and after against the declaration.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS TYPESCRIPT AND NOT SQL
 * ---------------------------------------------------------------------------------------
 *
 * A seal's hash is sha256 of its own content and SQLite cannot compute one. Rewriting a seal in SQL
 * would therefore have left it holding a hash of content it no longer carries — a seal that fails
 * its own verification on every read, which `readRunSeal` refuses by name. Here the reduced content
 * is hashed as it is written, so a rewritten seal still verifies against itself, and the hash it had
 * before is kept beside it under `reduced.was` so a hash written down anywhere else still resolves.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT AN OLD SEAL STILL PROVES AFTERWARDS, AND WHAT IT NO LONGER PROVES
 * ---------------------------------------------------------------------------------------
 *
 * STILL PROVES: the commit and the fork base; every changed file path with its hash and mode; every
 * submitted record with the revision id and hash it was at before this run and the revision id and
 * hash it is at now; every dependency record at its revision id and hash; and the hash the whole
 * seal carried when it was made.
 *
 * NO LONGER PROVES: which link rows of the workspace stood before and after the run, and the
 * per-event hashes of the change and link rows it wrote. Those were copies of rows in `links` and
 * `changes`, and `submission_events` — the only place the event hashes pointed — is gone. The definition
 * names three things a sealed tip names and links are not among them; this says out loud what that
 * costs rather than leaving somebody to find it.
 *
 * THE REVISION ROWS THEMSELVES ARE NOT LOST. Every one of them is still in `revisions`, which is
 * where a seal's pointer now leads and where the check reads content from. Nothing was deleted from
 * that table by this migration or by anything else in this repository.
 *
 * ---------------------------------------------------------------------------------------
 * THE IMMUTABILITY OF A SEAL IS NOT REMOVED TO DO THIS
 * ---------------------------------------------------------------------------------------
 *
 * `sealed_tip_no_update` and `sealed_tip_no_delete` are dropped and re-created inside this one
 * transaction, and only when there is something to rewrite. There is no boot on which a seal is
 * mutable and nothing says so, and a run that finds nothing to rewrite does not touch them at all.
 */
import type Database from 'better-sqlite3'
import { createHash } from 'node:crypto'

import { nowStamp } from '../../shared/time.ts'

export interface SealRewriteReport {
  /** Seals that held copies and were rewritten. */
  rewritten: number
  /** Seals that already held pointers, so nothing was done to them. */
  alreadyPointers: number
  /** Seals whose stored value could not be read as a seal. Left exactly as they are. */
  unreadable: { id: string; because: string }[]
  /** Bytes the `data` column of the rewritten seals held before and after. */
  bytes: { before: number; after: number }
  says: string
}

const hashOf = (value: string): string => createHash('sha256').update(value).digest('hex')

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** One revision seal, from the copy-carrying shape to the pointer shape. The hash is unchanged. */
function pointerFor(held: unknown, whose: string): Record<string, unknown> | null {
  if (!isObject(held)) return null
  const snapshot = isObject(held['snapshot']) ? held['snapshot'] : null
  // THE RECORD IT IS OF comes off the copy, which is the only place the old shape carried it. A
  // seal already in the pointer shape carries it directly, and both are read here.
  const record = held['record'] ?? snapshot?.['record_id']
  if (typeof record !== 'string' || typeof held['id'] !== 'string' || typeof held['hash'] !== 'string') {
    throw new Error(`The ${whose} revision of this seal names no record, id or hash.`)
  }
  return { record, id: held['id'], seq: Number(held['seq']), hash: held['hash'] }
}

/** Whether this stored seal still carries copies. A seal already reduced is left alone. */
function holdsCopies(seal: Record<string, unknown>): boolean {
  if (isObject(seal['reduced'])) return false
  const records = isObject(seal['records']) ? seal['records'] : null
  if (records === null) return false
  // THE OLD COPY OF LINKS WAS AN OBJECT, { before, after }. A seal's list of pinned links (round BM, item 2aq) is no
  // copy, so a seal that holds one is not rewritten for it.
  if (isObject(records['links']) || 'operations' in records) return true
  const list = Array.isArray(records['records']) ? records['records'] : []
  const deps = Array.isArray(records['dependencies']) ? records['dependencies'] : []
  return [...list, ...deps].some((one) => {
    if (!isObject(one)) return false
    if ('snapshot' in one) return true
    return isObject(one['after']) && 'snapshot' in one['after']
  })
}

export function migrateSealCopiesToPointers(sqlite: Database.Database): SealRewriteReport {
  const rows = sqlite
    .prepare("SELECT id, data FROM records WHERE kind = 'sealed_tip'")
    .all() as { id: string; data: string }[]

  const unreadable: { id: string; because: string }[] = []
  const toWrite: { id: string; data: string; was: number }[] = []
  let alreadyPointers = 0

  for (const row of rows) {
    let held: unknown
    try {
      held = JSON.parse(row.data)
    } catch (why) {
      unreadable.push({ id: row.id, because: `its data is not readable JSON: ${String(why)}` })
      continue
    }
    const data = isObject(held) ? held : null
    const seal = data !== null && isObject(data['seal']) ? data['seal'] : null
    if (seal === null) {
      unreadable.push({ id: row.id, because: 'it holds no seal object' })
      continue
    }
    if (!holdsCopies(seal)) {
      alreadyPointers += 1
      continue
    }
    const records = isObject(seal['records']) ? seal['records'] : null
    if (records === null) {
      unreadable.push({ id: row.id, because: 'it says it holds copies and has no records part' })
      continue
    }
    try {
      const list = (Array.isArray(records['records']) ? records['records'] : []).map((one) => {
        if (!isObject(one)) throw new Error('a submitted record entry is not an object')
        const after = pointerFor(one['after'], 'after')
        if (after === null) throw new Error('a submitted record names no current revision')
        return { id: String(one['id']), before: pointerFor(one['before'], 'before'), after }
      })
      const dependencies = (Array.isArray(records['dependencies']) ? records['dependencies'] : []).map(
        (one) => {
          const pointer = pointerFor(one, 'dependency')
          if (pointer === null) throw new Error('a dependency entry is not an object')
          return pointer
        },
      )
      const dropped = [
        ...(Array.isArray(records['records']) && records['records'].length > 0 ? ['records[].before.snapshot', 'records[].after.snapshot'] : []),
        ...(Array.isArray(records['dependencies']) && records['dependencies'].length > 0 ? ['dependencies[].snapshot'] : []),
        ...(isObject(records['links']) ? ['links'] : []),
        ...('operations' in records ? ['operations'] : []),
      ]
      // THE BASELINE AND `through` ARE CARRIED AS THEY STAND, and this says why they are not
      // converted here: 0154 converted the baselines TABLE, which is what a new seal reads. A seal
      // written before this holds the number it was made with, and rewriting it to a different
      // number would change what the seal says it did rather than what it kept.
      const reducedRecords = {
        workspace: records['workspace'],
        baseline: records['baseline'] ?? null,
        through: records['through'] ?? 0,
        records: list,
        dependencies,
        says:
          'This seal was made before 11 September 2026 and carried whole rows. Migration 0154 kept its pointers ' +
          'and hashes and dropped the copies. Its baseline and through are the numbers it was made with, in the ' +
          'submission_events ledger that no longer exists, so they order nothing any more.',
      }
      const was = typeof seal['hash'] === 'string' ? seal['hash'] : ''
      if (was === '') throw new Error('it carries no hash to keep')
      // THE KEY ORDER IS THE ORDER `sealFinishedRun` BUILDS IT IN, because `readRunSeal` re-hashes
      // `JSON.stringify` of the content with `hash` taken off, and JSON.stringify follows insertion
      // order. A rebuilt object in another order would hash differently and every read would refuse.
      const content: Record<string, unknown> = {
        version: seal['version'],
        run: seal['run'],
        execution: seal['execution'],
        attempt: seal['attempt'],
        area: seal['area'],
        sealedAt: seal['sealedAt'],
        kind: seal['kind'],
        git: seal['git'] ?? null,
        records: reducedRecords,
        reduced: {
          by: '0154',
          at: nowStamp(),
          dropped,
          was,
          says:
            'This seal still proves the commit, the file paths with their hashes, and every submitted and ' +
            'depended-on record by revision id and hash. It no longer proves which link rows stood before and ' +
            'after the run, or the per-event hashes of the change and link rows it wrote.',
        },
      }
      const rewritten = { ...data, seal: { ...content, hash: hashOf(JSON.stringify(content)) } }
      toWrite.push({ id: row.id, data: JSON.stringify(rewritten), was: row.data.length })
    } catch (why) {
      unreadable.push({ id: row.id, because: String(why instanceof Error ? why.message : why) })
    }
  }

  const before = toWrite.reduce((sum, one) => sum + one.was, 0)
  const after = toWrite.reduce((sum, one) => sum + one.data.length, 0)

  if (toWrite.length > 0) {
    // THE SEAL'S OWN IMMUTABILITY, DROPPED AND PUT BACK INSIDE ONE TRANSACTION. `migrateInPlace`
    // wraps every data step in one transaction, so a refusal below leaves both the seals and the
    // triggers as they were.
    sqlite.exec('DROP TRIGGER IF EXISTS sealed_tip_no_update')
    const write = sqlite.prepare('UPDATE records SET data = ? WHERE id = ?')
    for (const one of toWrite) write.run(one.data, one.id)
    sqlite.exec(
      "CREATE TRIGGER sealed_tip_no_update BEFORE UPDATE ON records WHEN OLD.kind = 'sealed_tip' " +
        "BEGIN SELECT RAISE(ABORT, 'A sealed tip is immutable'); END",
    )
  }

  const says =
    toWrite.length === 0
      ? `No seal held copies. ${String(alreadyPointers)} already hold pointers and hashes only.` +
        (unreadable.length === 0 ? '' : ` ${String(unreadable.length)} could not be read and were left as they are.`)
      : `${String(toWrite.length)} seals kept their pointers and hashes and lost their copies: ` +
        `${String(before)} bytes of seal data became ${String(after)}. ` +
        `${String(alreadyPointers)} already held pointers.` +
        (unreadable.length === 0
          ? ''
          : ` ${String(unreadable.length)} could not be read and were left exactly as they are: ` +
            unreadable.map((one) => `${one.id} — ${one.because}`).join('; '))

  return { rewritten: toWrite.length, alreadyPointers, unreadable, bytes: { before, after }, says }
}
