// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MECHANICAL RULES, NAMED BEFORE THE SEAL. A program checks what needs
 * no judgement, so a check stops refusing runs for paperwork. Wave 13j round 56
 * (src/server/lib/before-the-seal-rules.ts). The reminder itself
 * still stops nothing, except the migration items below (cases 10 and 11), which refuse the seal while the same checks
 * still find them. That decision rests on point 1 of a message. This was
 * in wave 14a round 1. Every other item stays a reminder.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 *   1. A commit that changes a file under tests/ that existed before the run, and also changes code, is named with its
 *      commit, each test file and its first changed line, and what to do.
 *   2. Such a commit after the run's first code commit is named, with that code commit.
 *   3. Such a commit with a one-line message is named.
 *   4. A .json file under tests/ is a criterion as much as a test file is (refusal of 13j round 54).
 *   5. Lines only added to an existing test file are a criterion change; a test file the run adds is not.
 *   6. The reader takes only the run's own commits: those written at or after the run started. Earlier commits on the
 *      branch are not judged and `notChecked` says how many. "Existed before the run" is read at the parent of the run's
 *      first own commit. It gives each test file's first changed line and its added lines.
 *   7. chaptersRead missing chapters is named, and is certain.
 *   8. No report linked to the run is named, and is certain.
 *   9. A changed page needs the report to name that page's file, as well as image blocks, the four widths and both themes.
 *  10. A migration the run adds comes in one commit with its journal row, and no later commit of the run changes it.
 *  11. A test line that names a migration by a bare "NNNN_" prefix is named with its file and line.
 *  12. Every item says whether it is certain (`mechanical`): a test proof and a starter's item are not. The reply's
 *      sentence counts the certain and the likely apart.
 *  13. The refused run of 11 October, 13j round 54 (UtHA9CNImJSN), as its commits were: each thing the check refused for
 *      its commits is named.
 *  14. The seal gate's pure half: only the migration items of a finder's reading are refused; a line that now names the
 *      whole migration, a git that could not be read and a starter's item refuse nothing.
 *
 * Every repository is made here in the system's temporary folder.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATIONS, NAMED, EACH AFTER A CONTROL RUN AND EACH RESTORED (round 56, src/server/lib/before-the-seal-rules.ts)
 * ---------------------------------------------------------------------------------------
 *
 *   - the mixed rule off: cases 1, 4, 5 and 13 go red;          - the after-code rule off: cases 2 and 6;
 *   - the one-line message rule off: cases 3, 6 and 13;         - only *.test.* files counted as criteria: cases 4, 13;
 *   - only lines taken out counted: cases 4, 5, 6 and 13;       - every commit since the fork base read as the run's: 6;
 *   - the chapters item not marked certain: case 7;            - "no report" not marked certain: cases 8 and 12;
 *   - page files not looked for in the report: case 9;          - the journal rule off: case 10;
 *   - the bare-prefix pattern asking five digits: case 11;      - every item counted as certain in the sentence: case 12.
 *
 * Wave 14a round 1, the seal gate's pure half. A mutation planned, to be run after the released
 * code and recorded here as measured then: `theMigrationItemsRefusingASeal` counting every item rather than the
 * migration items turns case 14 red.
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  theCommitsReadWith,
  theMigrationItemsRefusingASeal,
  whatAnInspectorWouldMostLikelyRefuse as judge,
  whatTheReminderSays,
  type ACommitOfTheRun,
  type TheFactsBeforeTheSeal,
} from '../src/server/lib/before-the-seal-rules.ts'

const directories: string[] = []
afterAll(() => {
  for (const directory of directories) rmSync(directory, { recursive: true, force: true })
})

const commit = (sha: string, files: ACommitOfTheRun['files'], body = ''): ACommitOfTheRun => ({ commit: sha.padEnd(40, '0'), subject: `commit ${sha}`, body, files })

const facts = (over: Partial<TheFactsBeforeTheSeal>): TheFactsBeforeTheSeal => ({
  runTitle: 'Round 1',
  testRuns: [],
  git: { commits: [], existedAtTheForkBase: () => false },
  reports: [{ id: 'report-1', title: 'What round 1 did', data: { chaptersRead: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], blocks: [{ type: 'prose', text: 'audit table left for the merger' }] } }],
  sameTitleElsewhere: {},
  mustRead: [1, 9],
  checkAlso: [],
  ...over,
})

const about = (over: Partial<TheFactsBeforeTheSeal>, kind: string) => judge(facts(over)).items.filter((one) => one.about === kind)

describe('the commit rules', () => {
  const existed = (path: string) => path === 'tests/old.test.ts' || path === 'tests/rows.json'

  it('1: a criterion change mixed with code names the commit, the file and its line, and what to do', () => {
    const mixed = { commits: [commit('m1', [{ path: 'tests/old.test.ts', status: 'M', removed: 1, firstLine: 12 }, { path: 'src/a.ts', status: 'M', removed: 0 }], 'old and new')], existedAtTheForkBase: existed }
    const items = about({ git: mixed }, 'commit')
    expect(items.map((one) => one.key)).toEqual(['commit:commit m1:mixed'])
    expect(items[0]!.says).toMatch(/^Commit m10000000 \("commit m1"\) changes tests\/old\.test\.ts:12, which existed before this run, and also changes code \(src\/a\.ts\)\./u)
    expect(items[0]!.says).toMatch(/What to do: /u)
    expect(items[0]!.mechanical).toBe(true)
  })

  it('2: a criterion change after the first code commit names that code commit', () => {
    const late = { commits: [commit('c1', [{ path: 'src/a.ts', status: 'M', removed: 0 }], 'x'), commit('c2', [{ path: 'tests/old.test.ts', status: 'M', removed: 3, firstLine: 40 }], 'old, new, why')], existedAtTheForkBase: existed }
    const items = about({ git: late }, 'commit')
    expect(items.map((one) => one.key)).toEqual(['commit:commit c2:after-code'])
    expect(items[0]!.says).toMatch(/^Commit c20000000 \("commit c2"\) changes tests\/old\.test\.ts:40, which existed before this run, after code commit c10000000\. .*What to do: /u)
  })

  it('3: a criterion commit with a one-line message is named', () => {
    const alone = { commits: [commit('t1', [{ path: 'tests/old.test.ts', status: 'M', removed: 3, firstLine: 7 }])], existedAtTheForkBase: existed }
    const items = about({ git: alone }, 'commit')
    expect(items.map((one) => one.key)).toEqual(['commit:commit t1:message'])
    expect(items[0]!.says).toMatch(/^Commit t10000000 \("commit t1"\) changes tests\/old\.test\.ts:7, which existed before this run, and its message is one line\. .*What to do: /u)
    expect(about({ git: { ...alone, commits: [commit('t1', alone.commits[0]!.files, 'was: a; is: b; because c; runs d')] } }, 'commit')).toEqual([])
  })

  it('4: a .json file under tests/ is a criterion', () => {
    const json = { commits: [commit('j1', [{ path: 'tests/rows.json', status: 'M', removed: 0, firstLine: 1437 }, { path: 'src/a.ts', status: 'M', removed: 1 }], 'x')], existedAtTheForkBase: existed }
    expect(about({ git: json }, 'commit').map((one) => one.key)).toEqual(['commit:commit j1:mixed'])
    expect(about({ git: json }, 'commit')[0]!.says).toContain('tests/rows.json:1437')
  })

  it('5: lines only added to an existing test are a criterion change; a test file the run adds is not', () => {
    const added = { commits: [commit('a1', [{ path: 'tests/old.test.ts', status: 'M', removed: 0, firstLine: 378 }, { path: 'src/a.ts', status: 'M', removed: 0 }], 'x')], existedAtTheForkBase: existed }
    expect(about({ git: added }, 'commit').map((one) => one.key)).toEqual(['commit:commit a1:mixed'])
    const own = { commits: [commit('a2', [{ path: 'tests/mine.test.ts', status: 'A', removed: 0 }, { path: 'src/a.ts', status: 'M', removed: 0 }])], existedAtTheForkBase: existed }
    expect(about({ git: own }, 'commit')).toEqual([])
  })
})

// ================================================================================================== the reader

const git = (dir: string, ...args: string[]): string => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' })

function write(dir: string, path: string, text: string): void {
  mkdirSync(dirname(join(dir, path)), { recursive: true })
  writeFileSync(join(dir, path), text)
}

/** Commit everything at a given author time, in seconds since 1970. */
function commitAt(dir: string, seconds: number, message: string): string {
  git(dir, 'add', '.')
  execFileSync('git', ['-C', dir, 'commit', '-qm', message], { env: { ...process.env, GIT_AUTHOR_DATE: `@${seconds} +0000`, GIT_COMMITTER_DATE: `@${seconds} +0000` } })
  return git(dir, 'rev-parse', 'HEAD').trim()
}

describe('the reader', () => {
  it("6: only the run's own commits are judged, existed-before is read where the run began, and lines are given", () => {
    const dir = mkdtempSync(join(tmpdir(), 'mole-office-mechanical-rules-'))
    directories.push(dir)
    git(dir, 'init', '-q', '-b', 'main')
    git(dir, 'config', 'user.name', 'Synthetic rules test')
    git(dir, 'config', 'user.email', 'rules@example.invalid')
    git(dir, 'config', 'commit.gpgsign', 'false')
    write(dir, 'src/a.ts', 'one\n')
    const base = commitAt(dir, 1_000_000, 'Synthetic base')
    git(dir, 'switch', '-qc', 'worker')
    // AN EARLIER RUN on the same branch adds a test, then changes it together with code: not this run's to answer for.
    write(dir, 'tests/earlier.test.ts', 'a\nb\nc\n')
    commitAt(dir, 1_000_100, 'Synthetic earlier run adds a test')
    write(dir, 'tests/earlier.test.ts', 'a\nB\nc\n')
    write(dir, 'src/a.ts', 'two\n')
    commitAt(dir, 1_000_200, 'Synthetic earlier run mixes')
    // THIS RUN, started at 1_000_500: code, then a change to the earlier run's test, which existed before this run.
    write(dir, 'src/a.ts', 'three\n')
    commitAt(dir, 1_000_600, 'Synthetic code')
    write(dir, 'tests/earlier.test.ts', 'a\nB\nc\nd\ne\n')
    const late = commitAt(dir, 1_000_700, 'Synthetic late criterion')
    const tip = git(dir, 'rev-parse', 'HEAD').trim()

    const read = theCommitsReadWith((...args) => git(dir, ...args), base, tip, 1_000_500_000)
    expect(read.commits.map((one) => one.subject)).toEqual(['Synthetic code', 'Synthetic late criterion'])
    expect(read.earlier).toBe(2)
    expect(read.existedAtTheForkBase('tests/earlier.test.ts')).toBe(true)
    const file = read.commits[1]!.files.find((one) => one.path === 'tests/earlier.test.ts')!
    expect(file).toMatchObject({ status: 'M', removed: 0, firstLine: 4, added: [{ line: 4, text: 'd' }, { line: 5, text: 'e' }] })

    const said = judge(facts({ git: read }))
    expect(said.items.filter((one) => one.about === 'commit').map((one) => one.says)).toEqual([
      expect.stringMatching(new RegExp(`^Commit ${late.slice(0, 9)} \\("Synthetic late criterion"\\) changes tests/earlier\\.test\\.ts:4, which existed before this run, after code commit`, 'u')),
      expect.stringMatching(/its message is one line/u),
    ])
    expect(said.notChecked.some((one) => /^2 commits on this branch were written before this run started/u.test(one))).toBe(true)

    // WITH NO START KNOWN, every commit since the fork base is the run's, and the reply says so.
    const all = theCommitsReadWith((...args) => git(dir, ...args), base, tip, null)
    expect(all.commits).toHaveLength(4)
    expect(all.earlier).toBeNull()
    expect(judge(facts({ git: all })).notChecked.some((one) => /the run gives no start/u.test(one))).toBe(true)
  })
})

// ================================================================================================== the report rules

describe('the report rules', () => {
  it('7: chaptersRead missing chapters is named, and is certain', () => {
    const items = about({ mustRead: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], reports: [{ id: 'r', title: 'Done', data: { chaptersRead: [6, 10], blocks: [] } }] }, 'report')
    expect(items.map((one) => one.key)).toEqual(['report:r:chapters'])
    expect(items[0]!.says).toMatch(/does not list chapters 1, 2, 3, 4, 5, 7, 8, 9 in chaptersRead/u)
    expect(items[0]!.mechanical).toBe(true)
  })

  it('8: no report linked to the run is named, and is certain', () => {
    const items = about({ reports: [] }, 'report')
    expect(items.map((one) => [one.key, one.mechanical])).toEqual([['report:none', true]])
  })

  it("9: a changed page's file is named in the report, beside image blocks, the four widths and both themes", () => {
    const page = { commits: [commit('p1', [{ path: 'src/web/pages/Thing.tsx', status: 'M', removed: 2 }, { path: 'src/web/components/Other.tsx', status: 'M', removed: 1 }])], existedAtTheForkBase: () => true }
    const blocks = [{ type: 'image', path: 'a.png', alt: '1440 light' }, { type: 'prose', text: 'Thing at 990, 660 and 390, dark too' }]
    const items = about({ git: page, reports: [{ id: 'r', title: 'Done', data: { chaptersRead: [1, 6, 9], blocks } }] }, 'pictures')
    expect(items.map((one) => one.key)).toEqual(['pictures:r'])
    expect(items[0]!.says).toMatch(/, and report r does not name src\/web\/components\/Other\.tsx\. /u)
    const named = [...blocks, { type: 'prose', text: 'Other, the same' }]
    expect(about({ git: page, reports: [{ id: 'r', title: 'Done', data: { chaptersRead: [1, 6, 9], blocks: named } }] }, 'pictures')).toEqual([])
  })
})

// ================================================================================================== migrations

describe('the migration rules', () => {
  it('10: a migration comes in one commit with its journal row, and is not changed later in the run', () => {
    const journal = (tag: string) => ({ path: 'drizzle/meta/_journal.json', status: 'M' as const, removed: 1, added: [{ line: 1600, text: `      "tag": "${tag}",` }] })
    const whole = { commits: [commit('g1', [{ path: 'drizzle/0232_a_thing.sql', status: 'A', removed: 0 }, journal('0232_a_thing')], 'x')], existedAtTheForkBase: () => false }
    expect(about({ git: whole }, 'migration')).toEqual([])
    const apart = { commits: [commit('g1', [{ path: 'drizzle/0232_a_thing.sql', status: 'A', removed: 0 }], 'x'), commit('g2', [journal('0232_a_thing')], 'x')], existedAtTheForkBase: () => false }
    const named = about({ git: apart }, 'migration')
    expect(named.map((one) => one.key)).toEqual(['migration:drizzle/0232_a_thing.sql:journal'])
    expect(named[0]!.says).toMatch(/^Commit g10000000 \("commit g1"\) adds drizzle\/0232_a_thing\.sql and not its row in drizzle\/meta\/_journal\.json\. .*What to do: /u)
    const changed = { commits: [...whole.commits, commit('g3', [{ path: 'drizzle/0232_a_thing.sql', status: 'M', removed: 1 }], 'x')], existedAtTheForkBase: () => false }
    const later = about({ git: changed }, 'migration')
    expect(later.map((one) => one.key)).toEqual(['migration:drizzle/0232_a_thing.sql:changed-later'])
    expect(later[0]!.says).toMatch(/^Commit g30000000 \("commit g3"\) changes drizzle\/0232_a_thing\.sql, which commit g10000000 added in this run\. .*What to do: /u)
    expect(later[0]!.mechanical).toBe(true)
  })

  it('14: the seal gate takes only migration items; cleared, unread and none refuse nothing', () => {
    const prefix = ['02', '16_'].join('')
    const aLine = (text: string) => ({ line: 4, text })
    const withPrefix = {
      commits: [commit('g1', [{ path: 'tests/a.test.ts', status: 'M' as const, removed: 1, firstLine: 4, added: [aLine(`    const before = migrationsBefore('${prefix}')`)] }])],
      existedAtTheForkBase: () => true,
    }
    const found = judge(facts({ git: withPrefix })).items
    expect(theMigrationItemsRefusingASeal(found).map((one) => one.key)).toEqual(['migration:tests/a.test.ts:4:bare-prefix'])
    // CLEARED: the same line now names the whole migration, so the finder names no migration item.
    const wholeTag = ['02', '16_a_handover_for_every_agent'].join('')
    const cleared = {
      commits: [commit('g1', [{ path: 'tests/a.test.ts', status: 'M' as const, removed: 1, firstLine: 4, added: [aLine(`    const before = migrationsBefore('${wholeTag}')`)] }])],
      existedAtTheForkBase: () => true,
    }
    expect(theMigrationItemsRefusingASeal(judge(facts({ git: cleared })).items)).toEqual([])
    // UNREAD: git could not be read, so the finder names nothing and the gate refuses nothing.
    expect(theMigrationItemsRefusingASeal(judge(facts({ git: { couldNotRead: 'no such directory' } })).items)).toEqual([])
    // NOT JUDGED: a starter's item is never a migration item, and no items is no refusal.
    expect(theMigrationItemsRefusingASeal([{ key: 'check-also:0', about: 'check also' as const, says: 'The starter asked.', mechanical: false }])).toEqual([])
    expect(theMigrationItemsRefusingASeal(null)).toEqual([])
  })

  it('11: a test line that names a migration by a bare prefix is named with its file and line', () => {
    const bare = { commits: [commit('b1', [{ path: 'tests/migration.test.ts', status: 'M', removed: 1, firstLine: 2062, added: [{ line: 2062, text: "    const before = migrationsBefore('0216_')" }] }], 'x')], existedAtTheForkBase: () => true }
    const items = about({ git: bare }, 'migration')
    expect(items.map((one) => one.key)).toEqual(['migration:tests/migration.test.ts:2062:bare-prefix'])
    expect(items[0]!.says).toMatch(/^tests\/migration\.test\.ts:2062 names a migration by the bare prefix '0216_'\. .*What to do: /u)
    const whole = { commits: [commit('b1', [{ ...bare.commits[0]!.files[0]!, added: [{ line: 2062, text: "    const before = migrationsBefore('0216_a_handover_for_every_agent')" }] }], 'x')], existedAtTheForkBase: () => true }
    expect(about({ git: whole }, 'migration')).toEqual([])
  })
})

// ================================================================================================== certain and likely

describe('certain and likely', () => {
  it('12: a test proof and a starter\'s item are likely; the reply counts the certain and the likely apart', () => {
    const changed = { commits: [commit('a1', [{ path: 'tests/new.test.ts', status: 'A', removed: 0 }])], existedAtTheForkBase: () => false }
    const { items } = judge(facts({ git: changed, checkAlso: ['Does it answer the person?'], reports: [] }))
    expect(items.map((one) => [one.about, one.mechanical])).toEqual([
      ['report', true],
      ['test proof', false],
      ['check also', false],
    ])
    expect(whatTheReminderSays(items)).toBe(
      '3 things an inspector would most likely refuse: 1 certain, which a program decided from the branch and the records, and 2 that need a person to judge. The write was not stored, and nothing is required.',
    )
    expect(whatTheReminderSays([])).toBe('Nothing was found that an inspector would most likely refuse, among the things this reminder checks. The write was not stored.')
  })
})

// ================================================================================================== a refused run

describe('a run the check refused', () => {
  it('13: 13j round 54 (UtHA9CNImJSN), its commits as they were: each thing the check refused for them is named', () => {
    const before = (path: string) => path.startsWith('tests/') && path !== 'tests/a-run-keeps-what-its-reminder-did.test.ts'
    const b7 = commit('b72656817', [
      { path: 'src/server/lib/before-the-seal.ts', status: 'M', removed: 16 },
      { path: 'tests/a-run-keeps-what-its-reminder-did.test.ts', status: 'A', removed: 0, firstLine: 1 },
      { path: 'tests/coded-refusals-keep-the-server-english.test.ts', status: 'M', removed: 1, firstLine: 5 },
      { path: 'tests/the-run-is-reminded-before-its-seal.test.ts', status: 'M', removed: 0, firstLine: 222 },
    ], 'one line')
    const e7 = commit('e7bab4448', [
      { path: 'src/server/lib/check-also.ts', status: 'M', removed: 1 },
      { path: 'src/shared/words/en-wave-13j.ts', status: 'M', removed: 0 },
      { path: 'tests/by-id-boundary.test.ts', status: 'M', removed: 0, firstLine: 378 },
      { path: 'tests/server-refusals-without-codes.json', status: 'M', removed: 0, firstLine: 1437 },
    ])
    const items = about({ git: { commits: [b7, e7], existedAtTheForkBase: before } }, 'commit')
    expect(items.map((one) => one.key)).toEqual(['commit:commit b72656817:mixed', 'commit:commit e7bab4448:mixed', 'commit:commit e7bab4448:message'])
    expect(items[0]!.says).toContain('tests/coded-refusals-keep-the-server-english.test.ts:5, tests/the-run-is-reminded-before-its-seal.test.ts:222')
    expect(items[1]!.says).toContain('tests/by-id-boundary.test.ts:378, tests/server-refusals-without-codes.json:1437')
    expect(items[1]!.says).toContain('src/server/lib/check-also.ts')
  })
})
