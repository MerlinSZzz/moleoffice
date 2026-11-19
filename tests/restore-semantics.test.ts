// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * G4 — THE DESTRUCTIVE RESTORE, AS A TEST: build a real Mole Office, export it, DELETE the database
 * file, rebuild from the text alone, and compare what Mole Office SAYS about the two.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS BESIDE tests/import-roundtrip.test.ts, AND WHAT IT ASKS THAT THAT DOES NOT
 * ---------------------------------------------------------------------------------------
 *
 * That file asks whether the importer reads back what the exporter wrote. It is thorough, and it
 * was written by the person who wrote the importer, against a hand-built fixture of about fifteen
 * records, and it never deletes anything. This asks a different question, from outside both:
 *
 *     IF THE DISK HOLDING ./data/panelx.db DIED RIGHT NOW, WHAT WOULD COME BACK?
 *
 * Four things follow from asking it that way, and each is the reason for a choice below.
 *
 *   1. THE CORPUS IS THE SEED, not a fixture — 290 records, 212 links, 641 change rows, sixty-one
 *      blocks over nine pipelines, Chinese titles, soft-deleted records, all three gate states. A
 *      restore proof over fifteen records tells you nothing about the database people have.
 *   2. THE DATABASE IS REALLY DELETED, and the archive is copied somewhere the deletion cannot
 *      reach first. The test asserts the file is gone before it restores.
 *   3. THE COMPARISON IS OF ANSWERS, NOT TABLES. Equal tables are necessary and not sufficient:
 *      what a person loses is the ranked attention list, the backlink on a record page, the blocks
 *      a pipeline holds in order. So the comparison runs the PRODUCT'S OWN readers over both
 *      databases and compares what they say — including the attention list, computed before and
 *      after against ONE fixed clock, which must hold the same rows in the same order.
 *   4. THE RESTORE RUNS THREE TIMES. Once into an empty database; again over the result, which
 *      must change nothing; and once more into a second empty database, which must produce the
 *      same thing. A restore that is not idempotent cannot be retried after an interruption, and
 *      being interrupted is the situation a restore exists for.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE THIS FILE IS BUILT AROUND
 * ---------------------------------------------------------------------------------------
 *
 * design/stages-audit/DECISIONS.md, decision 3: authored fields must be EQUAL and machine fields
 * must be ABSENT, asserted rather than skipped. And the rule that follows from it, which the
 * checker enforces on itself: A COMPARISON THAT LOOKED AT NOTHING IS VACUOUS, NEVER PASSED. Every
 * comparison below reports how many things it covered and what the corpus had to contain, and the
 * first test in the file asserts that none of them is vacuous.
 *
 * The comparison itself lives in scripts/restore-check.ts, which is also a runnable command. It is
 * imported rather than restated here, so the automated proof and the one a person runs by hand
 * cannot drift into two different ideas of what "the same database" means.
 *
 * ---------------------------------------------------------------------------------------
 * FOUR DATABASES, AND WHY THE IMPORTS ARE DYNAMIC
 * ---------------------------------------------------------------------------------------
 *
 * `src/server/db/client.ts` opens MOLE_OFFICE_DB once, when it is first imported, so a file that wants
 * four databases has to reset the module registry between them — which `freshDb()` does.
 *
 *   origin       the database the archive was taken from, and then deleted
 *   restored     an empty database the archive was imported into, twice
 *   independent  a second empty database, imported from the same archive once
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { cpSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, one, type TestDb } from './helpers.ts'
import {
  COMPARISON_NAMES,
  DECLARED_LOSSES,
  buildSnapshot,
  compareAccountingForLosses,
  compareSnapshots,
  fillEmptyTables,
  readTheRoleCardsAtStart,
  type Comparison,
  type LossOutcome,
  type Snapshot,
  outOfThisProof,
} from '../scripts/restore-check.ts'

type ImportLib = typeof import('../src/server/lib/import.ts')

/**
 * ONE CLOCK FOR EVERY READING.
 *
 * The attention rule scores how long a thing has sat, so a reading taken after the restore, a few
 * seconds later than the one before it, would differ for a reason that has nothing to do with the
 * restore. Fixed here, passed to every snapshot, and `compareSnapshots` refuses outright if two
 * snapshots disagree about it rather than reporting the passage of time as a failure.
 */
const NOW = Date.UTC(2026, 7, 10, 12, 0, 0)

let origin: TestDb
let restored: TestDb
let independent: TestDb
let archive: string
/** The copy the restore actually reads. Taken before the destruction, kept away from it. */
let preserved: string
/** The folder the seeded run's transcript is written into by fillEmptyTables; removed after all. */
let scratch: string
/** The two-file folder the index is built over; removed after all. */
let tree: string
let originFile: string

let before: Snapshot
let after: Snapshot
let twice: Snapshot
let third: Snapshot
let comparisons: Comparison[]
let losses: LossOutcome[]
let secondImport: Awaited<ReturnType<ImportLib['applyImport']>>

const named = (name: string): Comparison => {
  const found = comparisons.filter((c) => c.name === name)
  return one(found, `comparison named "${name}"`)
}

beforeAll(async () => {
  archive = mkdtempSync(join(tmpdir(), 'mole-office-restore-archive-'))
  preserved = mkdtempSync(join(tmpdir(), 'mole-office-restore-preserved-'))
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-restore-scratch-'))
  tree = mkdtempSync(join(tmpdir(), 'mole-office-restore-tree-'))

  // ---- 1 · a database holding realistic non-trivial data
  origin = await freshDb()
  originFile = origin.file
  // Importing the seed RUNS it, against the throwaway database freshDb just pointed the client at.
  await import('../scripts/seed.ts')
  // The derived layer is built on purpose, so that "it does not come back" is a measured number
  // rather than a claim. Without it, an excluded table and a table nobody filled look the same.
  // It is built over two small files made here, not over the checkout. A scan of the checkout
  // wrote one row per file in it, about 6,700, which was three rows in four of the archive and
  // more than two seconds of this hook, and it described this checkout rather than the test office.
  // Two files are enough for every reading below: the derived tables hold rows before and none
  // after, and the scan's rows sit beside the three that fillEmptyTables writes.
  writeFileSync(join(tree, 'a.ts'), 'export const a = 1\n')
  writeFileSync(join(tree, 'b.ts'), "import { a } from './a.ts'\nexport const b = a + 1\n")
  const { rebuildIndex } = await import('../src/server/lib/sourceindex.ts')
  rebuildIndex({ workspaceId: 'default', root: tree })
  // The four authored tables the seed leaves empty. Four of seven empty is a trap and not a
  // relief: a proof taken against the seed alone comes back green while carrying none of them.
  // fillEmptyTables presses the dead-letter sweep, which reads the role declaration. This process
  // is the process that builds the database, so it reads the cards once, here, the way buildApp
  // does — see readTheRoleCardsAtStart.
  await readTheRoleCardsAtStart()
  await fillEmptyTables(scratch)

  // ---- 2 · what Mole Office says about it
  before = await buildSnapshot(NOW)

  // ---- 3 · export it, and preserve the text where the destruction cannot reach it
  const exportLib = await import('../src/server/lib/export.ts')
  exportLib.writeExport(archive)
  cpSync(archive, preserved, { recursive: true })

  // ---- 4 · DESTROY the database. freshDb().close() closes the handle and deletes the directory
  //          the file lives in, which is the destruction this checkpoint asks for.
  origin.close()

  // ---- 5 · rebuild from the preserved text alone
  restored = await freshDb()
  const importLib = (await import('../src/server/lib/import.ts')) as ImportLib
  importLib.applyImport(preserved)
  after = await buildSnapshot(NOW)

  // ---- 6 · run the restore again over the same database, and read it again
  secondImport = importLib.applyImport(preserved)
  twice = await buildSnapshot(NOW)

  // ---- 7 · and once more into a database that has never seen this archive
  independent = await freshDb()
  const againImport = (await import('../src/server/lib/import.ts')) as ImportLib
  againImport.applyImport(preserved)
  third = await buildSnapshot(NOW)

  // The same function the command runs: differences a declared loss NAMES move under that loss,
  // and anything else stays where it is and fails.
  const accounted = compareAccountingForLosses(before, after)
  comparisons = accounted.comparisons
  losses = accounted.losses
  // THIS HOOK HAS A LIMIT OF ITS OWN, because the usual 10 seconds is too close. Run alone on
  // 3 November 2026, at a load of 13 on 20 cores, it took 7.3 seconds, 3.9 of them in the first freshDb.
}, 60_000)

afterAll(() => {
  for (const dir of [archive, preserved, scratch, tree]) rmSync(dir, { recursive: true, force: true })
  independent.close()
  restored.close()
})

// ================================================================ the checkpoint really happened

describe('the checkpoint really happened, rather than being described', () => {
  it('started from a corpus dense enough to judge a restore on', () => {
    expect(before.records.length).toBeGreaterThanOrEqual(229)
    expect(before.links.length).toBeGreaterThan(100)
    expect(before.changes.length).toBeGreaterThan(400)
    expect(Object.keys(before.recordsByKind).length).toBeGreaterThan(10)
  })

  it('had something in all seven authored tables, including the four the seed leaves empty', () => {
    for (const [table, rows] of Object.entries(before.tables)) {
      // Except the ones `NOT_IN_THIS_PROOF` names in scripts/restore-check.ts, which nothing in the
      // product can write yet. Asserted as zero rather than skipped, so a table that quietly gained
      // rows is a failure here too and not a silence.
      if (outOfThisProof(table)) {
        expect(rows, `${table} is declared out of this proof and the corpus holds rows for it`).toBe(0)
        continue
      }
      expect(rows, `${table} was empty before the export, so nothing about it was proved`).toBeGreaterThan(0)
    }
  })

  it('deleted the database file, and the restore therefore read the text and nothing else', () => {
    expect(existsSync(originFile), 'the origin database still exists, so nothing was destroyed').toBe(false)
  })

  it('restored into a database that started empty', () => {
    // `notInArchive` counts rows the archive does not mention. On the SECOND import every row is
    // in the archive, so this is asserted from the first restore's result instead: the restored
    // database holds exactly what the archive held.
    expect(after.tables).toEqual(before.tables)
  })
})

// ================================================================ every comparison, named

describe('every comparison the checkpoint promises is made, and none of them is vacuous', () => {
  it('makes exactly the comparisons it declares, in the declared order', () => {
    expect(comparisons.map((c) => c.name)).toEqual([...COMPARISON_NAMES])
  })

  it.each([...COMPARISON_NAMES])('%s — held, over more than nothing', (name) => {
    const comparison = named(name)
    expect(comparison.covers, `"${name}" compared nothing, so it proved nothing`).toBeGreaterThan(0)
    for (const need of comparison.needs) {
      expect(need.met, `"${name}" needs ${need.what}, and the corpus has ${need.measured}`).toBe(true)
    }
    expect(comparison.differences).toEqual([])
    expect(comparison.verdict).toBe('held')
  })
})

// ================================================================ the named semantics, one by one

describe('records of every kind', () => {
  it('brought back every kind that was there, with the same count in each', () => {
    expect(after.recordsByKind).toEqual(before.recordsByKind)
    expect(before.recordsByKind['block']).toBeGreaterThan(0)
    expect(before.recordsByKind['pipeline']).toBeGreaterThan(0)
    expect(before.recordsByKind['session']).toBeGreaterThan(0)
  })

  it('brought back a `data` blob eight levels deep, as a value rather than as text', () => {
    const deep = before.records.filter((r) => JSON.stringify(r.data).length > 4000)
    expect(deep.length).toBeGreaterThan(0)
    for (const record of deep) {
      const other = after.records.find((r) => r.id === record.id)
      expect(other?.data).toEqual(record.data)
    }
  })
})

describe('links and backlinks', () => {
  it('brought back both ends of every link, labelled from each end', () => {
    expect(after.backlinks).toEqual(before.backlinks)
    const backlinks = before.backlinks.flatMap((e) => e.links.filter((l) => l.isBacklink))
    expect(backlinks.length).toBeGreaterThan(0)
  })

  it('kept a link into a deleted record BROKEN rather than dropping it', () => {
    const broken = before.backlinks.flatMap((e) => e.links.filter((l) => l.broken))
    expect(broken.length).toBeGreaterThan(0)
    const brokenAfter = after.backlinks.flatMap((e) => e.links.filter((l) => l.broken))
    expect(brokenAfter.map((l) => l.linkId).sort()).toEqual(broken.map((l) => l.linkId).sort())
  })
})

describe('inferred versus confirmed relationships', () => {
  it('kept Mole Office\'s own guesses apart from what a person asserted', () => {
    const inferred = (s: Snapshot): string[] => s.links.filter((l) => l.inferred).map((l) => l.id).sort()
    expect(inferred(before).length).toBeGreaterThan(0)
    expect(inferred(before).length).toBeLessThan(before.links.length)
    expect(inferred(after)).toEqual(inferred(before))
  })
})

describe('block-to-module mappings', () => {
  it('kept every pipeline\'s blocks, in the order the pipeline stores them', () => {
    expect(after.pipelines).toEqual(before.pipelines)
    const ordered = before.pipelines.filter((p) => p.blocks.length > 1)
    expect(ordered.length).toBeGreaterThan(0)
  })

  it('kept which modules carry which block, now that the mapping is a link and not a title', () => {
    const carried = before.pipelines.flatMap((p) => p.blocks.map((b) => `${b.id}:${b.moduleIds.join(',')}`))
    const again = after.pipelines.flatMap((p) => p.blocks.map((b) => `${b.id}:${b.moduleIds.join(',')}`))
    expect(carried.some((c) => c.split(':')[1] !== '')).toBe(true)
    expect(again).toEqual(carried)
  })

  it('kept "no module carries this block" as an answer rather than filling it in', () => {
    const uncarried = before.pipelines.flatMap((p) => p.blocks.filter((b) => b.moduleIds.length === 0))
    expect(uncarried.length).toBeGreaterThan(0)
    const after_ = after.pipelines.flatMap((p) => p.blocks.filter((b) => b.moduleIds.length === 0))
    expect(after_.map((b) => b.id).sort()).toEqual(uncarried.map((b) => b.id).sort())
  })
})

describe('gates, hard and partial', () => {
  it('kept all three states apart, and NULL is one of them', () => {
    const tally = (s: Snapshot): Record<string, number> => {
      const t = { hard: 0, partial: 0, none: 0 }
      for (const l of s.links.filter((x) => x.type === 'blocks')) {
        if (l.gate === 'hard') t.hard += 1
        else if (l.gate === 'partial') t.partial += 1
        else t.none += 1
      }
      return t
    }
    const counted = tally(before)
    expect(counted.hard).toBeGreaterThan(0)
    expect(counted.partial).toBeGreaterThan(0)
    expect(counted.none).toBeGreaterThan(0)
    expect(tally(after)).toEqual(counted)
  })

  it('kept the stage a partial gate stops at', () => {
    const upTo = before.links.filter((l) => l.gateUpTo !== null)
    expect(upTo.length).toBeGreaterThan(0)
    for (const link of upTo) {
      expect(after.links.find((l) => l.id === link.id)?.gateUpTo).toBe(link.gateUpTo)
    }
  })

  it('kept the dependencies between blocks, which are now gated links', () => {
    const needs = before.pipelines.flatMap((p) => p.blocks.flatMap((b) => b.needs))
    expect(needs.length).toBeGreaterThan(0)
    expect(after.pipelines.flatMap((p) => p.blocks.flatMap((b) => b.needs))).toEqual(needs)
  })
})

describe('presentation intent', () => {
  it('brought back what somebody meant, and the drawing reads it back the same way', () => {
    expect(before.intent.length).toBeGreaterThan(0)
    expect(after.intent).toEqual(before.intent)
    expect(after.scopes).toEqual(before.scopes)
  })
})

/**
 * EVERY ASSERTION BELOW WALKS EVERY PROJECT.
 *
 * `snapshot.attention` and `snapshot.sessions` are one reading PER PROJECT, because both readings
 * are scoped: the attention rule and `resolveSessionRef` each answer about one workspace. These used
 * to read a single object and were therefore assertions about the default project wearing the name
 * of the whole database — which is the same shape of mistake as the proof itself running over a
 * corpus with one workspace. Each helper below prefixes the project id, so two projects holding a
 * record with the same key cannot cancel out.
 */
describe('attention-relevant semantics', () => {
  it('holds the same records, in the same order, on the visible list', () => {
    const visible = (s: Snapshot): string[] => s.attention.flatMap((a) => [a.workspaceId, ...a.visibleKeys])
    expect(before.attention.length).toBeGreaterThan(1)
    expect(visible(before).length).toBeGreaterThan(0)
    expect(visible(after)).toEqual(visible(before))
  })

  it('holds the same remainder, in the same order', () => {
    const remainder = (s: Snapshot): string[] => s.attention.flatMap((a) => [a.workspaceId, ...a.remainderKeys])
    expect(remainder(before).length).toBeGreaterThan(0)
    expect(remainder(after)).toEqual(remainder(before))
  })

  it('gives every row the same score, the same group and the same reason for being there', () => {
    const reduced = (s: Snapshot): unknown[] =>
      s.attention.flatMap((a) => a.rows).map((row) => {
        const r = row as Record<string, unknown>
        const reason = r['reason'] as Record<string, unknown>
        return {
          key: r['key'],
          score: r['score'],
          group: r['group'],
          safety: r['safety'],
          selectedBy: reason['selectedBy'],
          owed: reason['owed'],
          stoppedShort: reason['stoppedShort'],
          consequence: reason['consequence'],
          because: reason['because'],
          points: (reason['factors'] as { name: string; points: number }[]).map((f) => `${f.name}=${f.points}`),
        }
      })
    expect(reduced(after)).toEqual(reduced(before))
  })

  it('keeps the safety floor, which is the one row the rule refuses to rank on score', () => {
    const safety = (s: Snapshot): unknown[] =>
      s.attention
        .flatMap((a) => a.rows)
        .filter((r) => (r as { safety?: unknown }).safety === true)
        .map((r) => (r as { key: string }).key)
    expect(safety(before).length).toBeGreaterThan(0)
    expect(safety(after)).toEqual(safety(before))
  })

  it('passes over the same records, in the same named buckets', () => {
    const bucket = (s: Snapshot): unknown =>
      s.attention.flatMap((a) =>
        a.passedOver.map((g) => ({ workspaceId: a.workspaceId, bucket: g.bucket, count: g.count, keys: [...g.keys].sort() })),
      )
    expect(before.attention.flatMap((a) => a.passedOver).length).toBeGreaterThan(0)
    expect(bucket(after)).toEqual(bucket(before))
  })
})

describe('sessions where they belong', () => {
  it('brought back every session record, in the project it is filed in', () => {
    // MORE THAN ONE PROJECT HOLDS A SESSION, and one of them got there by being moved across the
    // boundary with its ledger row and its whole change log. That is the shape the five real
    // records had, and it is what a one-workspace corpus could never put in an archive.
    expect(before.sessions.filter((x) => x.records.length > 0).length).toBeGreaterThan(1)
    expect(after.sessions.map((x) => ({ w: x.workspaceId, records: x.records }))).toEqual(
      before.sessions.map((x) => ({ w: x.workspaceId, records: x.records })),
    )
  })

  it('kept every change row under the session that wrote it', () => {
    expect(before.sessions.flatMap((x) => x.storedRefs).length).toBeGreaterThan(0)
    expect(after.sessions.map((x) => [x.workspaceId, x.storedRefs, x.resolved])).toEqual(
      before.sessions.map((x) => [x.workspaceId, x.storedRefs, x.resolved]),
    )
  })

  it('kept every ledger row hanging off the session that started it', () => {
    expect(before.sessions.flatMap((x) => x.ledgerBySession).length).toBeGreaterThan(0)
    expect(after.sessions.map((x) => [x.workspaceId, x.ledgerBySession])).toEqual(
      before.sessions.map((x) => [x.workspaceId, x.ledgerBySession]),
    )
  })
})

describe('Unicode and Chinese text', () => {
  it('brought back every non-ASCII title code point for code point', () => {
    const chinese = before.text.filter((t) => /[一-鿿]/.test(t.text))
    expect(chinese.length).toBeGreaterThan(0)
    for (const entry of chinese) {
      const other = after.text.find((t) => t.id === entry.id && t.where === entry.where)
      // Code points, not the string: NFC and NFD look identical in a terminal and differ here.
      expect(other?.codePoints).toEqual(entry.codePoints)
    }
  })

  it('brought back the U+203A a block title is qualified with', () => {
    const separator = String.fromCodePoint(0x203a)
    const qualified = before.records.filter((r) => r.title.includes(separator))
    expect(qualified.length).toBeGreaterThan(0)
    for (const record of qualified) {
      expect(after.records.find((r) => r.id === record.id)?.title).toBe(record.title)
    }
  })

  it('brought back a newline stored inside a string, unbroken', () => {
    const withNewline = before.records.filter((r) => JSON.stringify(r.data).includes('\\n'))
    expect(withNewline.length).toBeGreaterThan(0)
    for (const record of withNewline) {
      expect(after.records.find((r) => r.id === record.id)?.data).toEqual(record.data)
    }
  })
})

describe('soft-deleted records with their recoverable history', () => {
  it('brought them back as deleted, with the stamp that says when', () => {
    expect(before.deleted.length).toBeGreaterThan(0)
    expect(after.deleted.map((r) => r.id).sort()).toEqual(before.deleted.map((r) => r.id).sort())
    for (const record of before.deleted) {
      expect(after.deleted.find((r) => r.id === record.id)?.deletedAt).toBe(record.deletedAt)
    }
  })

  it('brought back the change rows that make them recoverable', () => {
    const withHistory = before.deleted.filter((r) => r.history.length > 0)
    expect(withHistory.length).toBeGreaterThan(0)
    for (const record of withHistory) {
      expect(after.deleted.find((r) => r.id === record.id)?.history).toEqual(record.history)
    }
  })

  it('kept their data, so a restore is what makes an undelete possible at all', () => {
    for (const record of before.deleted) {
      expect(after.deleted.find((r) => r.id === record.id)?.data).toEqual(record.data)
    }
  })
})

// ================================================================ machine state, asserted absent

describe('the machine columns are absent afterwards, and this asserts it rather than skipping it', () => {
  it('had a real process group and a real start time before the export', () => {
    const withFacts = before.ledger.filter((r) => r.pgid !== null && r.osStartedAt !== null)
    expect(
      withFacts.length,
      'no ledger row carried machine facts, so asserting they are gone afterwards would prove nothing',
    ).toBeGreaterThan(0)
  })

  it('writes pgid as NULL on every restored ledger row', () => {
    expect(after.ledger.length).toBeGreaterThan(0)
    for (const row of after.ledger) expect(row.pgid, `ledger row ${row.id}`).toBeNull()
  })

  it('writes os_started_at as NULL on every restored ledger row', () => {
    for (const row of after.ledger) expect(row.osStartedAt, `ledger row ${row.id}`).toBeNull()
  })

  it('keeps every authored ledger column, including who released it and what they said', () => {
    const authored = (s: Snapshot): unknown[] =>
      s.ledger.map(({ pgid, osStartedAt, ...rest }) => {
        // Named here, not dropped from the snapshot: the two above are asserted NULL by the two
        // tests before this one, and this one asserts everything else is equal. Between them no
        // column of session_resources goes unchecked.
        void pgid
        void osStartedAt
        return rest
      })
    expect(authored(after)).toEqual(authored(before))
    expect(before.ledger.some((r) => r.releaseNote !== null)).toBe(true)
  })
})

// ================================================================ more than once

describe('running the restore more than once', () => {
  it('changes nothing the second time', () => {
    const total = (counts: Record<string, number>): number => Object.values(counts).reduce((n, v) => n + v, 0)
    expect(total(secondImport.inserts)).toBe(0)
    expect(total(secondImport.updates)).toBe(0)
    expect(total(secondImport.unchanged)).toBeGreaterThan(1000)
  })

  it('leaves a database identical to the one the first restore produced', () => {
    for (const comparison of compareSnapshots(after, twice)) {
      expect(comparison.differences, comparison.name).toEqual([])
    }
  })

  it('produces the same database from a second, independent restore', () => {
    for (const comparison of compareSnapshots(after, third)) {
      expect(comparison.differences, comparison.name).toEqual([])
    }
  })
})

// ================================================================ what does not round-trip

describe('what does not round-trip is named, and each declaration is still true', () => {
  it('the derived layer really was built, and really did not come back', () => {
    expect(Object.values(before.derived).some((n) => n > 0)).toBe(true)
    for (const [table, rows] of Object.entries(after.derived)) {
      expect(rows, `${table} came back with rows, and the format says it never should`).toBe(0)
    }
  })

  it('the change log comes back in the order it was appended in, and every anchor reads the same', () => {
    // PROBLEM BhszTJsVC8rF, FIXED BY MIGRATION 0194. This test used to assert the opposite: the
    // restore appended the log in archive-key order, a change id is a random nanoid, and "what has
    // changed since I last looked" moved with where the anchored row happened to land. Now the column
    // `append_order` holds the order, the archive carries it as `appendOrder`, and the importer
    // writes it back and inserts the rows in that order, so SQLite's own rowid order comes back too.
    expect(after.changeAppendOrder.length).toBeGreaterThan(600)
    expect(after.changeAppendOrder, 'the restore appended the change log in another order').toEqual(before.changeAppendOrder)
    expect(twice.changeAppendOrder, 'a second restore over the same database reordered the log').toEqual(before.changeAppendOrder)
    expect(third.changeAppendOrder, 'a restore into a second empty database reordered the log').toEqual(before.changeAppendOrder)
    // The consequence a person feels, on both readers the corpus carries. The caught-up reader is
    // anchored on the last row appended and has nothing new; the pinned one has rows after it. Both
    // answers are the same after the restore, row for row.
    const caughtUp = one(before.anchors.filter((a) => a.reader === `human:${THE_TEST_OFFICES_OWNER.id}`), 'the caught-up reader')
    const pinned = one(before.anchors.filter((a) => a.reader === 'agent:claude-code'), 'the pinned reader')
    expect(caughtUp.anchoredAt).toBe(caughtUp.rowsInLog - 1)
    expect(caughtUp.sinceAnchor).toBe(0)
    expect(pinned.sinceAnchor).toBe(pinned.rowsInLog - 1 - (pinned.anchoredAt ?? 0))
    expect(pinned.sinceAnchor).toBeGreaterThan(0)
    for (const snapshot of [after, twice, third]) {
      expect(one(snapshot.anchors.filter((a) => a.reader === `human:${THE_TEST_OFFICES_OWNER.id}`), 'the caught-up reader after')).toEqual(caughtUp)
      expect(one(snapshot.anchors.filter((a) => a.reader === 'agent:claude-code'), 'the pinned reader after')).toEqual(pinned)
    }
  })

  it('every declared loss really happened, so none of the declarations is stale', () => {
    for (const loss of DECLARED_LOSSES) {
      // The append-order loss stopped happening (see the test above). Its declaration is in
      // scripts/restore-check.ts, which is not this file's to edit; until it is deleted there, this
      // holds it to not happening, so the loss cannot come back quietly under an old excuse.
      if (loss.what.startsWith('the order the change log was APPENDED in')) {
        expect(loss.happened(before, after), 'the change log came back in a different append order').toBe(false)
        continue
      }
      expect(loss.happened(before, after), `declared but did not happen: ${loss.what}`).toBe(true)
    }
  })

  it('excuses no difference at all, because none is left to excuse', () => {
    // The anchor readings were the last differences a declaration absorbed, and they followed the
    // append order, which now comes back whole. A difference absorbed now would be a new loss hidden
    // under an old declaration.
    expect(losses.flatMap((l) => l.explained)).toEqual([])
  })

  it('the ranked list itself is NOT among what was absorbed, because it did not move', () => {
    const absorbed = losses.flatMap((l) => l.explained).map((d) => d.where)
    expect(absorbed.some((w) => w.startsWith('the visible attention list'))).toBe(false)
    expect(absorbed.some((w) => w.startsWith('the attention remainder'))).toBe(false)
    expect(absorbed.some((w) => /· (score|group|safety|state)$/.test(w))).toBe(false)
  })
})

// ================================================================ the archive was the only input

describe('the restore read the preserved text and nothing else', () => {
  it('never touched the real database', () => {
    // Every database in this file came from freshDb(), which mints a temporary directory and points
    // MOLE_OFFICE_DB at it. The repository's own file is named here so the assertion is about the thing
    // that matters rather than about a prefix.
    expect(restored.file).toContain('mole-office-test-')
    expect(restored.file).not.toContain('/data/panelx.db')
    expect(process.env.MOLE_OFFICE_DB).toBe(independent.file)
  })

  it('read from the copy, not from the directory the export was written to', () => {
    expect(preserved).not.toBe(archive)
    expect(existsSync(join(preserved, 'MANIFEST.md'))).toBe(true)
  })
})
