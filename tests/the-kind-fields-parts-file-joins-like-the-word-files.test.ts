// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * src/shared/kind-fields/parts.ts IS JUDGED AND JOINED AS src/shared/words/parts.ts IS (wave 13u round 76, item 14 of
 * 13u's list, from the asks in 13s round 96's END). A line that adds fields to a shared kind adds a file of its own under
 * src/shared/kind-fields and one re-export line to parts.ts. So two lines that each add such a file both add a line to
 * parts.ts, and the queue must not stop the second at a conflict that only needs both lines kept.
 *
 * WHY A FILE OF ITS OWN, BESIDE TWO OTHERS. tests/merge-line-files-round-7.test.ts judges words/parts.ts by line, and
 * tests/the-merge-tool-joins-list-files-round-22.test.ts joins list files in a real rebase. This file needs both kinds of
 * case for one file, so they are kept together here. The round 22 file builds its rebases on one refusal-codes file and
 * mocks the office side of the merge tool, and these cases need neither.
 *
 * WHAT THIS FILE PROVES, and which part of the change each case needs:
 * 1. Two entries that each add a file of fields and a line in parts.ts both land in a real rebase. The driver joins
 *    parts.ts, main's line first, and the joined file is judged again by file. Needs the file in THE_LIST_FILES
 *    (tools/merge-tool/list-join.mjs).
 * 2. A parts.ts that holds code is still judged by file, and the reason names the file refused. Needs the joining check
 *    (tools/merge-tool/lines.mjs, joiningFileHolds).
 * 3. The file as main holds it, its head comment and `export {}`, passes the joining check, and a line added there keeps
 *    its verdict by line. Needs the file in LINE_FILES (src/shared/merge-queue.ts) and the check's acceptance of
 *    `export {}`.
 * 4. A line's own file of fields, named for any kind as src/shared/kinds.ts says, is judged by line. Needs the pattern
 *    in src/shared/merge-queue.ts.
 *
 * The path of parts.ts and the pattern are read from src/shared/merge-queue.ts, and main's head comment from parts.ts.
 * Every repository here is a temporary one, and its files are synthetic.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { A_KIND_FIELDS_FILE_OF_ONE_LINE, LINE_FILES, THE_KIND_FIELDS_PARTS, isALineFile, whatChangedSinceTheVerdict } from '../src/shared/merge-queue.ts'
import { RECORD_KINDS } from '../src/shared/types.ts'
import { linesMeetOn, ownLinesOn } from '../tools/merge-tool/lines.mjs'
import { LIST_JOINS_SAID, LIST_JOIN_REFUSED, joinTheListsInThisClone } from '../tools/merge-tool/list-join.mjs'
import { aTestAddress } from './the-test-commit-address.mjs'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const PARTS = THE_KIND_FIELDS_PARTS
/** A kind whose name has `_`, which a line's file writes as `-`. */
const KIND = RECORD_KINDS.find((kind) => kind.includes('_'))!

/** parts.ts as main holds it, with these re-export lines between its head comment and `export {}`. */
function parts(...reExports: string[]) {
  const headComment = readFileSync(join(REPO, PARTS), 'utf8').split('\n').filter((line) => line.startsWith('//'))
  return [...headComment, ...reExports, 'export {}', ''].join('\n')
}

/** A line's own file of fields for `kind`, beside parts.ts and named as src/shared/kinds.ts's head comment says. */
function aLinesFile(kind: string, line: string) {
  const file = `${kind.replaceAll('_', '-')}-wave-${line}.ts`
  const name = file.slice(0, -'.ts'.length).split('-').map((word, n) => (n === 0 ? word : word[0]!.toUpperCase() + word.slice(1))).join('')
  const fields = (...keys: string[]) => `export const ${name} = {\n  kind: '${kind}',\n  fields: [\n${keys.map((key) => `    { key: '${key}' },\n`).join('')}  ],\n}\n`
  return { path: `${dirname(PARTS)}/${file}`, name, fields, text: fields('synthetic'), reExport: `export { ${name} } from './${file}'` }
}

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

/** A temporary repository on `main` that takes no git directory, work tree or configuration from the caller. */
function aRepository() {
  const root = mkdtempSync(join(tmpdir(), 'kind-fields-parts-'))
  roots.push(root)
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' }
  for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'GIT_PREFIX', 'GIT_OBJECT_DIRECTORY']) delete env[key]
  const git = (...args: string[]) => execFileSync('git', ['-c', 'gc.auto=0', '-C', root, ...args], { encoding: 'utf8', env }).trim()
  const tried = (...args: string[]) => spawnSync('git', ['-c', 'gc.auto=0', '-C', root, ...args], { encoding: 'utf8', env })
  const commit = (files: Record<string, string>) => {
    for (const [path, text] of Object.entries(files)) { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text) }
    git('add', '-A'); git('commit', '-qm', 'Synthetic test content')
    return git('rev-parse', 'HEAD')
  }
  git('init', '-qb', 'main'); git('config', 'user.name', 'Synthetic fixture'); git('config', 'user.email', aTestAddress('fixture'))
  return { root, git, tried, commit }
}

describe('parts.ts', () => {
  it('lands two entries that each add a file of fields and a line at one place, joined, and judges the joined file again by file', () => {
    const r = aRepository()
    const [first, second] = [aLinesFile(KIND, 'synthetic-a'), aLinesFile(KIND, 'synthetic-b')]
    const base = r.commit({ [PARTS]: parts() })
    r.git('checkout', '-qb', 'entry')
    const entry = r.commit({ [second.path]: second.text, [PARTS]: parts(second.reExport) })
    r.git('checkout', '-q', 'main')
    const main = r.commit({ [first.path]: first.text, [PARTS]: parts(first.reExport) })
    r.git('checkout', '-q', 'entry')
    joinTheListsInThisClone(r.root, (pair: string[]) => r.git('config', ...pair))
    const rebase = r.tried('rebase', '--quiet', main)
    const said = (name: string) => (existsSync(join(r.root, '.git', name)) ? readFileSync(join(r.root, '.git', name), 'utf8') : '')
    expect(rebase.status, `the rebase stopped: ${said(LIST_JOIN_REFUSED)}${rebase.stderr}`).toBe(0)
    expect(readFileSync(join(r.root, PARTS), 'utf8')).toBe(parts(first.reExport, second.reExport))
    expect(said(LIST_JOINS_SAID)).toContain(`joined ${PARTS} `)
    for (const one of [first, second]) expect(readFileSync(join(r.root, one.path), 'utf8'), one.path).toBe(one.text)
    // The two lines meet, so the verdict does not follow them: the joined file is read again by file.
    const held = { path: PARTS, ...ownLinesOn(r.root, { base, commit: entry, path: PARTS, onto: main, joined: r.git('rev-parse', 'HEAD') }) }
    expect(held.held).toBe(false)
    expect(held.why, 'the joined file is a plain joining file; only the lines meet').not.toContain(PARTS)
    expect(whatChangedSinceTheVerdict({ [PARTS]: 'judged' }, { [PARTS]: 'joined' }, [held]).changed).toEqual([PARTS])
  })

  it('judges by file a parts.ts that holds code, and says which file it refused', () => {
    const r = aRepository()
    const mine = aLinesFile(KIND, 'synthetic-a')
    const base = r.commit({ [PARTS]: parts() })
    const commit = r.commit({ [mine.path]: mine.text, [PARTS]: parts(mine.reExport) })
    r.git('checkout', '-q', '--detach', base)
    const onto = r.commit({ [PARTS]: parts() + 'export const SYNTHETIC_CODE = 1\n' })
    r.git('cherry-pick', commit)
    const held = { path: PARTS, ...ownLinesOn(r.root, { base, commit, path: PARTS, onto, joined: r.git('rev-parse', 'HEAD') }) }
    expect(held.held, 'a line beside code is not judged by line').toBe(false)
    expect(held.why).toContain(PARTS)
    expect(linesMeetOn(r.root, PARTS, base, { base, commit }, { base, commit: onto })).toMatchObject({ meet: true, why: expect.stringContaining(PARTS) })
    expect(whatChangedSinceTheVerdict({ [PARTS]: 'judged' }, { [PARTS]: 'joined' }, [held]).changed).toEqual([PARTS])
  })

  it('names src/shared/words/parts.ts by its path when it refuses it too', () => {
    const words = LINE_FILES.find((path) => path !== PARTS && basename(path) === basename(PARTS))!
    const r = aRepository()
    const base = r.commit({ [words]: 'export const SYNTHETIC_CODE = 1\n' })
    const commit = r.commit({ [words]: "export const SYNTHETIC_CODE = 1\nexport { synthetic } from './synthetic.ts'\n" })
    expect(ownLinesOn(r.root, { base, commit, path: words, onto: base, joined: commit })).toMatchObject({ held: false, why: expect.stringContaining(words) })
  })

  it('takes main\'s file, its head comment and `export {}`, as a plain joining file, and a line added there keeps its verdict by line', () => {
    const r = aRepository()
    const [mine, other] = [aLinesFile(KIND, 'synthetic-a'), aLinesFile(KIND, 'synthetic-b')]
    const base = r.commit({ [PARTS]: parts() })
    const commit = r.commit({ [mine.path]: mine.text, [PARTS]: parts(mine.reExport) })
    expect(ownLinesOn(r.root, { base, commit, path: PARTS, onto: base, joined: commit }), 'main\'s file and one line added to it').toMatchObject({ held: true })
    // Another line's re-export landed first below `export {}`, so one unchanged line stands between the two.
    r.git('checkout', '-q', '--detach', base)
    const onto = r.commit({ [other.path]: other.text, [PARTS]: parts() + other.reExport + '\n' })
    r.git('cherry-pick', commit)
    const held = { path: PARTS, ...ownLinesOn(r.root, { base, commit, path: PARTS, onto, joined: r.git('rev-parse', 'HEAD') }) }
    expect(held.held, held.why).toBe(true)
    expect(linesMeetOn(r.root, PARTS, base, { base, commit }, { base, commit: onto })).toMatchObject({ meet: false })
    expect(isALineFile(PARTS), 'src/shared/merge-queue.ts judges parts.ts by line').toBe(true)
    expect(whatChangedSinceTheVerdict({ [PARTS]: 'judged' }, { [PARTS]: 'joined' }, [held])).toEqual({ kept: [PARTS], changed: [], keptByLine: [held] })
  })
})

describe('a line\'s own file of fields', () => {
  it('is judged by line for every kind, and another file in the folder is not', () => {
    for (const kind of RECORD_KINDS) {
      const { path } = aLinesFile(kind, 'synthetic-a')
      expect(A_KIND_FIELDS_FILE_OF_ONE_LINE.test(path), path).toBe(true)
      expect(isALineFile(path), path).toBe(true)
    }
    expect(isALineFile(`${dirname(PARTS)}/synthetic-notes.ts`)).toBe(false)
  })

  it('keeps its verdict by line when another round of the line adds a field away from its own', () => {
    const mine = aLinesFile(KIND, 'synthetic-a')
    const r = aRepository()
    const base = r.commit({ [mine.path]: mine.fields('first', 'second', 'third') })
    const commit = r.commit({ [mine.path]: mine.fields('first', 'mine', 'second', 'third') })
    r.git('checkout', '-q', '--detach', base)
    const onto = r.commit({ [mine.path]: mine.fields('first', 'second', 'third', 'theirs') })
    r.git('cherry-pick', commit)
    const held = { path: mine.path, ...ownLinesOn(r.root, { base, commit, path: mine.path, onto, joined: r.git('rev-parse', 'HEAD') }) }
    expect(held.held, held.why).toBe(true)
    expect(whatChangedSinceTheVerdict({ [mine.path]: 'judged' }, { [mine.path]: 'joined' }, [held])).toEqual({ kept: [mine.path], changed: [], keptByLine: [held] })
  })
})
