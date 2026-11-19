// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PACKAGE BUILD TAKES A HOST SCREEN'S VERDICT FOR THE TREE IT PACKS.
 *
 * The owner's content list never reaches a build of a line's commit. A whole-tree screen on the host,
 * which holds the list, screens the commit and writes one JSON file. The package build names that file
 * with --owner-content-verdict, reads it in one place, and refuses unless the file is whole, it found
 * nothing, the checkout is clean, and its tree is the checkout's own HEAD tree.
 *
 * With an accepted verdict the build still runs every plain privacy file. A red file still refuses. A
 * file with no result is let through only when every one of its cases was taken out because the owner's
 * list was not read; the case says so in its meta, which vitest's JSON report writes.
 *
 * A checkout marked as the clean version, with no verdict, is judged the same way: a red file refuses,
 * and a file with no result is let through only on the same test. A marked checkout that also holds
 * design/ is refused before any privacy file runs.
 *
 * Every checkout, verdict file and report here is made under one scratch folder and removed when this
 * file ends. Nothing here needs the owner's list or reads the real host screen.
 *
 * MUTATIONS: a broken reader for each refusal, a reader that compares the commit instead of the tree,
 * a step that lets a red file through under a verdict or in the clean version, and a step that lets an
 * unmarked checkout through as the clean version each turn a case here red.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'
import { THE_CLEAN_VERSION_MARK } from './the-copyright-line.ts'
import { THE_OWNERS_CONTENT, THE_OWNERS_CONTENT_SETTING, takenOutWithoutTheOwnersContent } from './the-owners-content-list.ts'
import { whyThisIsNotTheCleanVersion } from '../scripts/the-clean-version-mark.mjs'
import { readTheOwnerContentVerdict, runTheOwnerContentStep } from '../scripts/the-owner-content-verdict.mjs'
import { theBuildSteps } from '../scripts/the-mac-build.mjs'

const REPO = fileURLToPath(new URL('..', import.meta.url))
/** A scratch folder under the out folder when the run names one, or the swept test folder otherwise. */
const under = process.env['MOLE_TEST_SCRATCH']
const temporary = under === undefined ? aTestDatabaseFolder('owner-content-verdict') : aTestDatabaseFolder('owner-content-verdict', under)
afterAll(() => removeThisTestFolder(temporary))
let serial = 0

interface ACheckout {
  readonly root: string
  readonly commit: string
  readonly tree: string
}

/** Run git in a folder and answer its trimmed output; a failed git command fails the test. */
function git(root: string, args: string[]): string {
  const ran = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' })
  expect(ran.status, ran.stderr).toBe(0)
  return ran.stdout.trim()
}

/** A clean git checkout of its own, with one commit, under the scratch folder. */
function aCheckout(): ACheckout {
  const root = join(temporary, `tree-${String(++serial)}`)
  mkdirSync(join(root, 'tests'), { recursive: true })
  writeFileSync(join(root, 'tests', 'a-file.txt'), 'the tree the verdict names\n')
  git(root, ['init', '-q'])
  git(root, ['add', '-A'])
  git(root, ['-c', 'user.name=a test', '-c', 'user.email=test@example.invalid', 'commit', '-q', '-m', 'the tree the verdict names'])
  return { root, commit: git(root, ['rev-parse', 'HEAD']), tree: git(root, ['rev-parse', 'HEAD^{tree}']) }
}

/** A checkout as aCheckout makes it, that carries the clean version's mark and has no design/. */
function aMarkedCheckout(): ACheckout {
  const checkout = aCheckout()
  mkdirSync(join(checkout.root, '.mole-office'))
  writeFileSync(join(checkout.root, THE_CLEAN_VERSION_MARK), '{}\n')
  return checkout
}

/** No list of the owner's content was read, as in the clean version. A marked case gives this, whatever the test run read. */
const NO_LIST = { notRead: `${THE_OWNERS_CONTENT_SETTING} is not set, so no file of the owner's content was read.`, content: null }

/** One more commit on the same tree, so HEAD's commit differs and HEAD's tree does not. */
function anotherCommitOnTheSameTree(root: string): string {
  git(root, ['-c', 'user.name=a test', '-c', 'user.email=test@example.invalid', 'commit', '--allow-empty', '-q', '-m', 'the same tree again'])
  return git(root, ['rev-parse', 'HEAD'])
}

/** A verdict object with the five keys, over what the caller gives. */
function aVerdict(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    commit: 'a'.repeat(40),
    tree: 'b'.repeat(40),
    madeAt: '2026-11-17 20:00:00',
    screen: 'the whole-tree host screen',
    found: [],
    ...overrides,
  }
}

/** Write a verdict file in the scratch folder, outside every checkout, and answer its path. */
function aVerdictFile(value: unknown, raw = false): string {
  const folder = join(temporary, 'verdicts')
  mkdirSync(folder, { recursive: true })
  const path = join(folder, `verdict-${String(++serial)}.json`)
  writeFileSync(path, raw ? String(value) : JSON.stringify(value))
  return path
}

/** A case vitest skipped because the owner's list was not read, as the JSON report writes it. */
const OWNER_LIST_SKIP = { status: 'skipped', fullName: 'a case that needs the list', meta: { takenOut: 'the owner list was not read. This case needs the owner\'s real content.', takenOutWithoutTheOwnersContent: true } }
/** A case skipped for any other reason: no marker says the owner's list was why. */
const OTHER_SKIP = { status: 'skipped', fullName: 'a case set aside', meta: { takenOut: 'set aside by the list of cases taken out.' } }

interface ARunEntry {
  readonly file: string
  readonly firstFailedCase: string
}
interface ANoResult {
  readonly file: string
  readonly reason: string
}
interface ARunAnswer {
  readonly files: string[]
  readonly red: ARunEntry[]
  readonly noResult: ANoResult[]
  readonly report: string
}

/** What runThePlainPrivacyFiles would have answered, with a report of its own under the scratch folder. */
function aRunAnswer(
  root: string,
  options: {
    red?: ARunEntry[]
    noResult?: ANoResult[]
    cases?: Record<string, Array<{ status: string; fullName: string; meta: Record<string, unknown> }>>
  } = {},
): ARunAnswer {
  const red = options.red ?? []
  const noResult = options.noResult ?? []
  const cases = options.cases ?? {}
  const report = join(temporary, `report-${String(++serial)}.json`)
  const testResults = Object.entries(cases).map(([file, assertionResults]) => ({ name: join(root, file), status: 'passed', assertionResults }))
  writeFileSync(report, JSON.stringify({ testResults }))
  return {
    files: [...new Set([...Object.keys(cases), ...red.map((one) => one.file), ...noResult.map((one) => one.file)])].sort(),
    red,
    noResult,
    report,
  }
}

/** A step's refusal, with the test failing when it was not refused. */
function theRefusal(answer: { refused: string | null }): string {
  expect(answer.refused, 'the step was expected to refuse').not.toBeNull()
  return String(answer.refused)
}

/** A verdict-shaped JSON value, written from a checkout that is clean at HEAD. */
function aWholeVerdict(checkout: ACheckout, overrides: Record<string, unknown> = {}): string {
  return aVerdictFile(aVerdict({ commit: checkout.commit, tree: checkout.tree, ...overrides }))
}

describe('the owner-content verdict is read and judged in one place', () => {
  it('refuses a verdict file that is not there', () => {
    const checkout = aCheckout()
    const answer = readTheOwnerContentVerdict({ root: checkout.root, path: join(temporary, 'no-such-verdict.json') })
    expect(theRefusal(answer)).toMatch(/could not be read/)
  })

  it('refuses a path that is not a readable file', () => {
    const checkout = aCheckout()
    const folder = join(temporary, 'a-folder-not-a-verdict')
    mkdirSync(folder)
    const answer = readTheOwnerContentVerdict({ root: checkout.root, path: folder })
    expect(theRefusal(answer)).toMatch(/could not be read/)
  })

  it('refuses a file that is not JSON', () => {
    const checkout = aCheckout()
    const answer = readTheOwnerContentVerdict({ root: checkout.root, path: aVerdictFile('not JSON at all', true) })
    expect(theRefusal(answer)).toContain('is not JSON')
  })

  it('refuses a verdict that is not one JSON object', () => {
    const checkout = aCheckout()
    for (const value of [[], null, 'a verdict', 7]) {
      const answer = readTheOwnerContentVerdict({ root: checkout.root, path: aVerdictFile(value) })
      expect(theRefusal(answer)).toContain('not one JSON object')
    }
  })

  it.each([
    ['commit', { commit: 'A'.repeat(40) }],
    ['tree', { tree: 'b'.repeat(39) }],
    ['madeAt', { madeAt: '2026-11-17T20:00:00' }],
    ['screen', { screen: '' }],
    ['found', { found: 'nothing' }],
  ])('names %s when that key is wrong', (key, wrong) => {
    const checkout = aCheckout()
    const answer = readTheOwnerContentVerdict({ root: checkout.root, path: aVerdictFile(aVerdict({ commit: checkout.commit, tree: checkout.tree, ...wrong })) })
    expect(theRefusal(answer)).toContain(key)
  })

  it('names a key that is missing and a key that is extra', () => {
    const checkout = aCheckout()
    const missing = aVerdict({ commit: checkout.commit, tree: checkout.tree })
    delete missing['tree']
    expect(theRefusal(readTheOwnerContentVerdict({ root: checkout.root, path: aVerdictFile(missing) }))).toContain('tree')
    const extra = aVerdict({ commit: checkout.commit, tree: checkout.tree, aNote: 'not part of the shape' })
    expect(theRefusal(readTheOwnerContentVerdict({ root: checkout.root, path: aVerdictFile(extra) }))).toContain('aNote')
  })

  it('refuses a verdict that found something, says how many and prints each finding', () => {
    const checkout = aCheckout()
    const findings = ['a name in a tool file', { path: 'design/a-note.md', line: 4 }]
    const answer = readTheOwnerContentVerdict({ root: checkout.root, path: aVerdictFile(aVerdict({ commit: checkout.commit, tree: checkout.tree, found: findings })) })
    const refused = theRefusal(answer)
    expect(refused).toContain('found 2')
    expect(refused).toContain('a name in a tool file')
    expect(refused).toContain('design/a-note.md')
  })

  it('refuses a folder that is not a git checkout', () => {
    const root = join(temporary, 'not-a-checkout')
    mkdirSync(root)
    const answer = readTheOwnerContentVerdict({ root, path: aVerdictFile(aVerdict()) })
    expect(theRefusal(answer)).toContain('not a git checkout')
  })

  it('refuses a checkout with an untracked file', () => {
    const checkout = aCheckout()
    writeFileSync(join(checkout.root, 'an-untracked-file.txt'), 'not committed\n')
    const answer = readTheOwnerContentVerdict({ root: checkout.root, path: aVerdictFile(aVerdict({ commit: checkout.commit, tree: checkout.tree })) })
    const refused = theRefusal(answer)
    expect(refused).toContain('untracked')
    expect(refused).toContain('an-untracked-file.txt')
  })

  it('refuses a checkout with a change', () => {
    const checkout = aCheckout()
    writeFileSync(join(checkout.root, 'tests', 'a-file.txt'), 'changed after the commit\n')
    const answer = readTheOwnerContentVerdict({ root: checkout.root, path: aVerdictFile(aVerdict({ commit: checkout.commit, tree: checkout.tree })) })
    const refused = theRefusal(answer)
    expect(refused).toContain('changes')
    expect(refused).toContain('tests/a-file.txt')
  })

  it('refuses a verdict for another tree, whatever its commit says', () => {
    const checkout = aCheckout()
    const answer = readTheOwnerContentVerdict({ root: checkout.root, path: aVerdictFile(aVerdict({ commit: checkout.commit, tree: '0'.repeat(40) })) })
    const refused = theRefusal(answer)
    expect(refused).toContain(checkout.tree)
    expect(refused).toContain('0'.repeat(40))
  })

  it('goes on when the commit differs and the tree is the same, and answers the commit at HEAD', () => {
    const checkout = aCheckout()
    const head = anotherCommitOnTheSameTree(checkout.root)
    expect(head).not.toBe(checkout.commit)
    expect(git(checkout.root, ['rev-parse', 'HEAD^{tree}'])).toBe(checkout.tree)
    const answer = readTheOwnerContentVerdict({ root: checkout.root, path: aWholeVerdict(checkout) })
    expect(answer.refused).toBeNull()
    expect(answer.verdict).toMatchObject({ commit: checkout.commit, tree: checkout.tree })
    expect(answer.headCommit).toBe(head)
  })
})

describe('the verdict lets through only a missing result the owner list took out', () => {
  const coveredFile = 'tests/no-file-in-the-tools-kit-names-the-owner.test.ts'
  const otherFile = 'tests/another-plain-file.test.ts'

  it('works exactly as today with no flag', () => {
    const checkout = aCheckout()
    const noResult = aRunAnswer(checkout.root, { noResult: [{ file: coveredFile, reason: 'the report gives no loaded case result.' }] })
    const answer = runTheOwnerContentStep({ root: checkout.root, work: join(temporary, 'work'), say: () => {}, verdictPath: null, run: () => noResult })
    expect(theRefusal(answer)).toBe(`The plain privacy files are red or gave no result in ${coveredFile}, so nothing was packed.`)

    const red = aRunAnswer(checkout.root, { red: [{ file: otherFile, firstFailedCase: 'a failed case' }] })
    expect(theRefusal(runTheOwnerContentStep({ root: checkout.root, work: join(temporary, 'work'), say: () => {}, verdictPath: null, run: () => red }))).toBe(
      `The plain privacy files are red or gave no result in ${otherFile}, so nothing was packed.`,
    )

    const passed = aRunAnswer(checkout.root, { cases: { [coveredFile]: [{ status: 'passed', fullName: 'a plain case', meta: {} }] } })
    expect(runTheOwnerContentStep({ root: checkout.root, work: join(temporary, 'work'), say: () => {}, verdictPath: null, run: () => passed }).refused).toBeNull()
  })

  it('accepts a file whose every case was taken out because the owner list was not read, and logs the verdict', () => {
    const checkout = aCheckout()
    const said: string[] = []
    const run = aRunAnswer(checkout.root, {
      noResult: [{ file: coveredFile, reason: 'the report gives no loaded case result.' }],
      cases: { [coveredFile]: [OWNER_LIST_SKIP] },
    })
    const answer = runTheOwnerContentStep({ root: checkout.root, work: join(temporary, 'work'), say: (line) => said.push(line), verdictPath: aWholeVerdict(checkout), run: () => run })
    expect(answer.refused).toBeNull()
    expect(answer.covered).toEqual([coveredFile])
    const log = said.join('\n')
    expect(log).toContain('The owner-content verdict was used')
    expect(log).toContain(`commit ${checkout.commit}`)
    expect(log).toContain(`tree ${checkout.tree}`)
    expect(log).toContain('madeAt 2026-11-17 20:00:00')
    expect(log).toContain('screen "the whole-tree host screen"')
    expect(log).toContain(coveredFile)
  })

  it('does not judge how old madeAt is, and prints it', () => {
    const checkout = aCheckout()
    const said: string[] = []
    const answer = runTheOwnerContentStep({
      root: checkout.root,
      work: join(temporary, 'work'),
      say: (line) => said.push(line),
      verdictPath: aWholeVerdict(checkout, { madeAt: '1999-01-01 00:00:00' }),
      run: () => aRunAnswer(checkout.root, { cases: { [coveredFile]: [{ status: 'passed', fullName: 'a plain case', meta: {} }] } }),
    })
    expect(answer.refused).toBeNull()
    expect(said.join('\n')).toContain('madeAt 1999-01-01 00:00:00')
  })

  it('names both commits in the log when the commit differs and the tree is the same', () => {
    const checkout = aCheckout()
    const head = anotherCommitOnTheSameTree(checkout.root)
    const said: string[] = []
    const answer = runTheOwnerContentStep({
      root: checkout.root,
      work: join(temporary, 'work'),
      say: (line) => said.push(line),
      verdictPath: aWholeVerdict(checkout),
      run: () => aRunAnswer(checkout.root, { cases: { [coveredFile]: [{ status: 'passed', fullName: 'a plain case', meta: {} }] } }),
    })
    expect(answer.refused).toBeNull()
    const log = said.join('\n')
    expect(log).toContain(checkout.commit)
    expect(log).toContain(head)
  })

  it('still refuses a red file under a verdict', () => {
    const checkout = aCheckout()
    const said: string[] = []
    const answer = runTheOwnerContentStep({
      root: checkout.root,
      work: join(temporary, 'work'),
      say: (line) => said.push(line),
      verdictPath: aWholeVerdict(checkout),
      run: () =>
        aRunAnswer(checkout.root, {
          red: [{ file: otherFile, firstFailedCase: 'a failed case' }],
          noResult: [{ file: coveredFile, reason: 'the report gives no loaded case result.' }],
          cases: { [coveredFile]: [OWNER_LIST_SKIP] },
        }),
    })
    const refused = theRefusal(answer)
    expect(refused).toContain('red')
    expect(refused).toContain(otherFile)
    expect(said.join('\n')).not.toContain('The owner-content verdict was used')
  })

  it('still refuses a file with no result for another reason', () => {
    const checkout = aCheckout()
    const answer = runTheOwnerContentStep({
      root: checkout.root,
      work: join(temporary, 'work'),
      say: () => {},
      verdictPath: aWholeVerdict(checkout),
      run: () => aRunAnswer(checkout.root, { noResult: [{ file: otherFile, reason: 'the report gives no loaded case result.' }], cases: { [otherFile]: [OTHER_SKIP] } }),
    })
    const refused = theRefusal(answer)
    expect(refused).toContain(otherFile)
    expect(refused).toContain('does not cover')
  })

  it('refuses a file whose cases were taken out for two different reasons', () => {
    const checkout = aCheckout()
    const answer = runTheOwnerContentStep({
      root: checkout.root,
      work: join(temporary, 'work'),
      say: () => {},
      verdictPath: aWholeVerdict(checkout),
      run: () => aRunAnswer(checkout.root, { noResult: [{ file: otherFile, reason: 'the report gives no loaded case result.' }], cases: { [otherFile]: [OWNER_LIST_SKIP, OTHER_SKIP] } }),
    })
    expect(theRefusal(answer)).toContain('does not cover')
  })

  it('refuses a file whose report names no case at all', () => {
    const checkout = aCheckout()
    const answer = runTheOwnerContentStep({
      root: checkout.root,
      work: join(temporary, 'work'),
      say: () => {},
      verdictPath: aWholeVerdict(checkout),
      run: () => aRunAnswer(checkout.root, { noResult: [{ file: otherFile, reason: 'the report gives no loaded case result.' }], cases: { [otherFile]: [] } }),
    })
    expect(theRefusal(answer)).toContain('does not cover')
  })

  it('refuses a missing result whose report cannot be read', () => {
    const checkout = aCheckout()
    const run = aRunAnswer(checkout.root, { noResult: [{ file: coveredFile, reason: 'the report gives no loaded case result.' }], cases: { [coveredFile]: [OWNER_LIST_SKIP] } })
    const answer = runTheOwnerContentStep({
      root: checkout.root,
      work: join(temporary, 'work'),
      say: () => {},
      verdictPath: aWholeVerdict(checkout),
      run: () => ({ ...run, report: join(temporary, 'no-report.json') }),
    })
    expect(theRefusal(answer)).toContain('does not cover')
  })

  it('says when the verdict covered no missing result', () => {
    const checkout = aCheckout()
    const said: string[] = []
    const answer = runTheOwnerContentStep({
      root: checkout.root,
      work: join(temporary, 'work'),
      say: (line) => said.push(line),
      verdictPath: aWholeVerdict(checkout),
      run: () => aRunAnswer(checkout.root, { cases: { [coveredFile]: [{ status: 'passed', fullName: 'a plain case', meta: {} }] } }),
    })
    expect(answer.refused).toBeNull()
    expect(said.join('\n')).toContain('covered no missing result')
  })
})

describe('a checkout marked as the clean version is judged as a verdict is, with no verdict', () => {
  const coveredFile = 'tests/no-file-in-the-tools-kit-names-the-owner.test.ts'
  const otherFile = 'tests/another-plain-file.test.ts'
  const work = join(temporary, 'work')

  it('refuses a marked checkout that also holds design/, in the one sentence, before any privacy file runs', () => {
    const checkout = aMarkedCheckout()
    mkdirSync(join(checkout.root, 'design'))
    writeFileSync(join(checkout.root, 'design', 'a-note.md'), '# A note\n')
    let ran = false
    const answer = runTheOwnerContentStep({
      root: checkout.root,
      work,
      say: () => {},
      verdictPath: null,
      ownersContent: NO_LIST,
      run: () => {
        ran = true
        return aRunAnswer(checkout.root)
      },
    })
    expect(theRefusal(answer)).toBe(whyThisIsNotTheCleanVersion(checkout.root, NO_LIST))
    expect(answer.privacy).toBeNull()
    expect(ran).toBe(false)
  })

  it("lets through a file whose every case was taken out because the owner's list was not read, and says why in the log", () => {
    const checkout = aMarkedCheckout()
    const said: string[] = []
    const run = aRunAnswer(checkout.root, {
      noResult: [{ file: coveredFile, reason: 'the report gives no loaded case result.' }],
      cases: { [coveredFile]: [OWNER_LIST_SKIP] },
    })
    const answer = runTheOwnerContentStep({ root: checkout.root, work, say: (line) => said.push(line), verdictPath: null, ownersContent: NO_LIST, run: () => run })
    expect(answer.refused).toBeNull()
    expect(answer.covered).toEqual([coveredFile])
    const log = said.join('\n')
    expect(log).toContain('This checkout is the clean version')
    expect(log).toContain(THE_CLEAN_VERSION_MARK)
    expect(log).toContain("the screen for the owner's content was not repeated")
    expect(log).toContain(`It covered the missing result in ${coveredFile}.`)
    expect(log).not.toContain('The owner-content verdict was used')
  })

  it('still refuses a red file in the clean version', () => {
    const checkout = aMarkedCheckout()
    const said: string[] = []
    const answer = runTheOwnerContentStep({
      root: checkout.root,
      work,
      say: (line) => said.push(line),
      verdictPath: null,
      ownersContent: NO_LIST,
      run: () =>
        aRunAnswer(checkout.root, {
          red: [{ file: otherFile, firstFailedCase: 'a failed case' }],
          noResult: [{ file: coveredFile, reason: 'the report gives no loaded case result.' }],
          cases: { [coveredFile]: [OWNER_LIST_SKIP] },
        }),
    })
    expect(theRefusal(answer)).toBe(`The plain privacy files are red in ${otherFile} (a failed case), so nothing was packed, even in the clean version.`)
    expect(said.join('\n')).not.toContain('This checkout is the clean version')
  })

  const notCovered: Array<[string, Array<{ status: string; fullName: string; meta: Record<string, unknown> }>]> = [
    ['its every case was taken out for another reason', [OTHER_SKIP]],
    ['its cases were taken out for two different reasons', [OWNER_LIST_SKIP, OTHER_SKIP]],
    ['the report gives it no case', []],
  ]
  it.each(notCovered)('still refuses a file with no result where %s, with the reason', (_, cases) => {
    const checkout = aMarkedCheckout()
    const reason = 'the report gives no loaded case result.'
    const answer = runTheOwnerContentStep({
      root: checkout.root,
      work,
      say: () => {},
      verdictPath: null,
      ownersContent: NO_LIST,
      run: () => aRunAnswer(checkout.root, { noResult: [{ file: otherFile, reason }], cases: { [otherFile]: cases } }),
    })
    const refused = theRefusal(answer)
    expect(refused).toContain(`The plain privacy files gave no result in ${otherFile} (${reason}), and the clean version does not cover it: `)
    expect(refused).toContain('Nothing was packed.')
  })

  it('refuses a missing result whose report cannot be read', () => {
    const checkout = aMarkedCheckout()
    const run = aRunAnswer(checkout.root, { noResult: [{ file: coveredFile, reason: 'the report gives no loaded case result.' }], cases: { [coveredFile]: [OWNER_LIST_SKIP] } })
    const answer = runTheOwnerContentStep({ root: checkout.root, work, say: () => {}, verdictPath: null, ownersContent: NO_LIST, run: () => ({ ...run, report: join(temporary, 'no-report.json') }) })
    expect(theRefusal(answer)).toContain('the clean version does not cover it: The report')
  })

  it('says when it covered no missing result', () => {
    const checkout = aMarkedCheckout()
    const said: string[] = []
    const answer = runTheOwnerContentStep({
      root: checkout.root,
      work,
      say: (line) => said.push(line),
      verdictPath: null,
      ownersContent: NO_LIST,
      run: () => aRunAnswer(checkout.root, { cases: { [coveredFile]: [{ status: 'passed', fullName: 'a plain case', meta: {} }] } }),
    })
    expect(answer.refused).toBeNull()
    expect(said.join('\n')).toContain('This checkout is the clean version')
    expect(said.join('\n')).toContain('It covered no missing result.')
  })

  it('leaves an unmarked checkout as it was: the same missing result refuses, with design/ or without it', () => {
    for (const design of [false, true]) {
      const checkout = aCheckout()
      if (design) {
        mkdirSync(join(checkout.root, 'design'))
        writeFileSync(join(checkout.root, 'design', 'a-note.md'), '# A note\n')
      }
      const said: string[] = []
      const run = aRunAnswer(checkout.root, { noResult: [{ file: coveredFile, reason: 'the report gives no loaded case result.' }], cases: { [coveredFile]: [OWNER_LIST_SKIP] } })
      const answer = runTheOwnerContentStep({ root: checkout.root, work, say: (line) => said.push(line), verdictPath: null, ownersContent: NO_LIST, run: () => run })
      expect(theRefusal(answer)).toBe(`The plain privacy files are red or gave no result in ${coveredFile}, so nothing was packed.`)
      expect(said.join('\n')).not.toContain('This checkout is the clean version')
    }
  })
})

describe('the cases say why they were taken out', () => {
  it.skipIf(THE_OWNERS_CONTENT.notRead === null)('marks a case taken out because no owner list was read', () => {
    const meta: { takenOut?: string; takenOutWithoutTheOwnersContent?: boolean } = {}
    let skipped = ''
    const takenOut = takenOutWithoutTheOwnersContent({ skip: (note) => { skipped = note }, task: { meta } })
    expect(takenOut).toBe(true)
    expect(meta.takenOutWithoutTheOwnersContent).toBe(true)
    expect(skipped).toContain('taken out')
  })
})

describe('one reader serves the three packagers and the Mac build', () => {
  it('the three package scripts call the one step and keep no copy of the verdict shape', () => {
    for (const name of ['package-linux.mjs', 'package-windows.mjs', 'package-mac.mjs']) {
      const source = readFileSync(join(REPO, 'scripts', name), 'utf8')
      expect(source, name).toContain("from './the-owner-content-verdict.mjs'")
      expect(source, name).toContain('runTheOwnerContentStep({')
      expect(source, name).not.toContain('runThePlainPrivacyFiles')
      expect(source, name).not.toContain('madeAt')
      expect(source, name).not.toContain('takenOutWithoutTheOwnersContent')
    }
  })

  it('the Mac build takes the flag and gives it to both package-mac commands', () => {
    const verdict = '/a/scratch/owner-content-verdict.json'
    const options = { checkout: REPO, execPath: process.execPath, local: false, out: '/a/mac-out', ownerContentVerdict: verdict }
    const steps = theBuildSteps(options)
    const packagers = steps.filter((step) => step.args[0] === join(REPO, 'scripts', 'package-mac.mjs'))
    expect(packagers).toHaveLength(2)
    for (const step of packagers) {
      const at = step.args.indexOf('--owner-content-verdict')
      expect(at, step.args.join(' ')).toBeGreaterThan(-1)
      expect(step.args[at + 1]).toBe(verdict)
    }
    const build = readFileSync(join(REPO, 'scripts', 'build-on-a-mac.mjs'), 'utf8')
    expect(build).toContain('--owner-content-verdict')
  })

  it('a package script refuses the flag with no file before it makes the output folder', () => {
    const source = readFileSync(join(REPO, 'scripts', 'package-linux.mjs'), 'utf8')
    const flag = source.indexOf('--owner-content-verdict')
    const folder = source.indexOf('mkdirSync(out, { recursive: true })')
    expect(flag).toBeGreaterThan(-1)
    expect(folder).toBeGreaterThan(-1)
    expect(source.slice(flag, folder)).toContain('needs a file')
  })
})
