#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT THIS CORPUS ACTUALLY HOLDS ABOUT ITS OWN PAST, MEASURED RATHER THAN QUOTED.
 *
 * Wave 10's plan carries figures — 530 baseline-only records out of 650, 181 change rows written by
 * window B — and three of round ten's numbers have already turned out to be ones this corpus never
 * held. So every figure wave 10 rests on is taken here, by this script, on a COPY, and the script
 * stays in the repository so the next reader can re-take them rather than believe them.
 *
 * IT NEVER OPENS data/panelx.db. Pass it a path made with `VACUUM INTO`:
 *
 *     node -e "new (require('better-sqlite3'))('data/panelx.db',{readonly:true}).exec(\"VACUUM INTO '/tmp/copy.db'\")"
 *     node tools/measure-the-history.mjs /tmp/copy.db
 *
 * It prints JSON on stdout and nothing else, so its output can be kept beside a verification file.
 */
import { whyThisCheckoutMayNotOpenTheDatabase } from '../src/config/settings.mjs'
import { resolve } from 'node:path'
import Database from 'better-sqlite3'
import { canonicalDatabasePath } from '../src/config/settings.mjs'
import { localStamp } from '../src/shared/time.ts'

const path = process.argv[2]
if (path === undefined) {
  console.error('usage: measure-the-history.mjs <a VACUUM INTO copy>')
  process.exit(2)
}
const pairingRefusal = whyThisCheckoutMayNotOpenTheDatabase(path)
if (pairingRefusal !== null) throw new Error(pairingRefusal)
// The database the declaration calls canonical, compared as a resolved path rather than by a
// spelling of its name, so moving the corpus does not stop this guarding.
if (resolve(path) === canonicalDatabasePath()) {
  console.error('refusing: that is the live file. Take a VACUUM INTO copy first.')
  process.exit(2)
}
const db = new Database(path, { readonly: true })
const one = (sql, ...args) => db.prepare(sql).get(...args)
const all = (sql, ...args) => db.prepare(sql).all(...args)

const liveRecords = one('select count(*) as n from records where deleted_at is null').n
const allRecords = one('select count(*) as n from records').n
const recordsWithRevisions = one('select count(distinct record_id) as n from revisions').n

/** The badge's three facts, counted the way A2's table splits them. */
const byOpWhenOnlyOne = all(`
  select op, count(*) as n from (
    select record_id, max(op) as op from revisions group by record_id having count(*) = 1
  ) group by op order by n desc`)
const onlyOneRevision = byOpWhenOnlyOne.reduce((sum, row) => sum + row.n, 0)
const baselineOnly = byOpWhenOnlyOne.find((row) => row.op === 'baseline')?.n ?? 0

/** Window B's mark on the ledger: rows whose note says a migration wrote them. */
const changeRows = one('select count(*) as n from changes').n
const revisionRows = one('select count(*) as n from revisions').n
const windowBChanges = all(`
  select actor_id as actor, count(*) as n from changes
  where actor_id like 'system:%' group by actor_id order by n desc`)
const windowBRevisions = all(`
  select op, count(*) as n from revisions
  where note like '%migration%' or note like '%carried%' group by op order by n desc`)

/** The worst page: a record's own revisions plus its own change rows plus link rows at either end. */
const worstPages = all(`
  select r.id, r.kind, r.title,
    (select count(*) from revisions v where v.record_id = r.id) as versions,
    (select count(*) from changes c where c.record_id = r.id) as ownChanges,
    (select count(*) from changes c where c.record_id = r.id)
      + (select count(*) from revisions v where v.record_id = r.id) as entries
  from records r where r.deleted_at is null
  order by entries desc limit 5`)

const restores = all("select record_id as recordId, seq, content_hash as hash from revisions where op = 'restore'")
const restoreArcs = restores.map((row) => {
  const earlier = one(
    'select min(seq) as seq from revisions where record_id = ? and content_hash = ? and seq < ?',
    row.recordId, row.hash, row.seq,
  )
  return { ...row, arcTo: earlier?.seq ?? null }
})

console.log(JSON.stringify({
  measuredOn: path,
  measuredAt: localStamp(new Date()), // local wall-clock time, chapter 4 rule 8 (acceptance finding 63)
  records: { live: liveRecords, all: allRecords, withAnyRevision: recordsWithRevisions },
  revisions: { rows: revisionRows, byOp: all('select op, count(*) as n from revisions group by op order by n desc') },
  changes: { rows: changeRows, bySystemActor: windowBChanges },
  theBadge: { onlyOneRevision, byOpWhenOnlyOne, baselineOnly, outOf: allRecords },
  windowB: { revisionsWhoseNoteSaysMigration: windowBRevisions },
  worstPages,
  restoreArcs,
}, null, 2))
db.close()
