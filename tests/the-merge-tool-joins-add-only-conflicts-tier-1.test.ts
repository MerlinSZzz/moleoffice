// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * CONFLICTS WHERE BOTH SIDES ONLY ADDED ARE JOINED BY FOUR RULES (wave 13p, tier 1 of the owner's decision, as the
 * secretary answered it in zfcrXd9PDKnj). On 15 October two entries bounced on conflicts the
 * list rule of round 22 did not take:
 * merge entry wxxhqYe3kPDu, where main added a name to an import line of src/server/lib/messages.ts and the entry added an
 * import line above it, and merge entry igosHDrHgqv5, where both added a key to src/shared/words/zh-made-from.ts. The
 * merge driver (tools/merge-tool/list-join.mjs) now joins a hunk made only of one-line imports in any code file, puts the
 * keys of zh-made-from.ts in key order, and joins a list file's hunk whose ancestor lines both sides kept.
 *
 * The office and the sandbox are stubs, as in tests/the-merge-tool-joins-list-files-round-22.test.ts and
 * tests/real-conflicts-bounce-early-round-25.test.ts, whose stubs this copies. The git trees are real and temporary.
 *
 * WHAT THIS FILE PROVES:
 * 1. The two real bounces, cut from their real commits (tests/fixtures/list-join-tier-1), join, and say so in the
 *    sentences of 6FtvFxuBouW0 part 4.
 * 2. When both sides widened one import line, the joined line is main's, byte for byte, with the entry's new names before
 *    its closing brace, in the entry's order, and no name twice (Q3).
 * 3. A list file's hunk whose ancestor lines both sides kept joins (the whole-line check).
 * 4. Each rule refuses what it does not take, and the sentence names the file, the line and the rule.
 * 5. In a real git rebase, a code file's import hunk joins and is written down one line for each hunk joined, and a hunk
 *    that is not imports still stops the rebase, with its sentence.
 * 6. The pin's early probe and the rebase agree: what the probe marks as one the rebase may join, the rebase joins, and
 *    what the driver refuses, the probe does not mark.
 * 7. Through the queue's own integration (integrateGit), an import join lands and the run's log carries its sentence.
 *
 * MUTATION PROOF (control, mutation, restore; the commit message of the code records the runs). Each goes red where named:
 *   - a widened import line no longer counts as kept: the wxxhqYe3kPDu join;
 *   - zh-made-from.ts is joined main's lines first, as a list: the igosHDrHgqv5 join;
 *   - the names of a joined import line are sorted: the Q3 join;
 *   - a list file's hunk with ancestor lines is refused, as before tier 1: the whole-line join;
 *   - the driver keeps an import line that lost a name: the removed-name refusal;
 *   - the driver no longer compares the modules: the other-module refusal;
 *   - a name bound twice is not looked for: the two-modules refusal;
 *   - a code file's hunk that is not imports is joined main's lines first: the not-an-import refusal;
 *   - an import over more than one line is joined main's lines first: the multi-line refusal;
 *   - a changed line of a list file counts as kept: the changed-line refusal;
 *   - a key both sides added is kept once whatever its values: the two-values refusal;
 *   - the key order is not checked: the not-in-key-order refusal;
 *   - the early probe takes only list files, as before tier 1: the agreement case.
 * The refusal of the rule "two additions at one place", two definitions of one name, is round 22's; its mutation is
 * run there.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { aTestAddress } from './the-test-commit-address.mjs'

const boundary = vi.hoisted(() => ({ folder: '', logs: [] as string[], state: {} as Record<string, any> }))
vi.mock('../tools/merge-tool/arguments.mjs', async () => ({
  theOwnerContentPatterns: async () => (await import('./the-owners-content-patterns.ts')).THE_PATTERNS,
  withThePairing: (env: Record<string, string | undefined>) => ({ ...env }),
  get WORKDIR() { return join(boundary.folder, 'logs') },
  THIS_CHECKOUT: fileURLToPath(new URL('..', import.meta.url)),
  ABSENT: 'absent', API: '', WORKSPACE: 'synthetic', PINNED_REF_PREFIX: 'refs/synthetic/',
  SCRIPT_TIMEOUT_MS: 30_000, SUITE_TIMEOUT_MS: 30_000,
  GIT_IDENTITY: (await import('./the-test-commit-address.mjs')).aTestIdentity('Synthetic queue', 'fixture'),
  chosen: { entry: 'synthetic-entry', pinOnly: false, get sandboxes() { return join(boundary.folder, 'sandboxes') } },
}))
vi.mock('../tools/merge-tool/log-and-state.mjs', () => {
  class MergerFailure extends Error {}
  class ACloneNamesAProgram extends MergerFailure {}
  return {
    MergerFailure, ACloneNamesAProgram, fail: (words: string) => { throw new MergerFailure(words) }, log: (words: string) => boundary.logs.push(words),
    stamp: () => '2026-10-16 00:00:00', writeState: (patch: Record<string, any>) => { boundary.state = patch },
  }
})
vi.mock('../tools/merge-tool/documents.mjs', () => ({ theRecordOfMain: () => ({ record: null }), theDocumentsOf: () => ({ none: 'Synthetic code entry' }) }))
vi.mock('../tools/merge-tool/office-keeper.mjs', () => ({
  theSeal: async (entry: any) => ({ git: { commit: entry.changeset.commit, files: [] } }),
  theSandbox: async () => { standIn('up', 'merge', '--name', 'synthetic-sandbox', '--from', boundary.folder); return { name: 'synthetic-sandbox', folder: join(boundary.folder, 'sandboxes', 'synthetic-sandbox') } },
  step: async (name: string, facts: Record<string, any>) => ({ step: name, facts }),
  keepTheReport: () => { throw Error('No report copying in these fixtures') },
  runInSandbox: async (_sandbox: any, label: string, command: string, args: string[], options: any) => {
    const result = standIn('exec', 'synthetic-sandbox', '--cwd', options.cwd, '--wait', '--plain-env', '--timeout', '30', '--', command, ...args)
    const outFile = join(boundary.folder, 'logs', label + '.log')
    writeFileSync(outFile, result.stdout + result.stderr)
    return { code: result.status, signal: result.signal, timedOut: false, outFile, tail: (result.stdout + result.stderr).split('\n').slice(-12).join('\n') }
  },
}))
function standIn(...args: string[]) {
  const cut = args.indexOf('--') < 0 ? args.length : args.indexOf('--')
  return spawnSync(process.execPath, [join(REPO, 'tests/stand-in-sandbox-tool.mjs'), ...args.slice(0, cut), '--sandboxes', join(boundary.folder, 'sandboxes'), ...args.slice(cut)], { encoding: 'utf8', timeout: 60_000 })
}
import { canItJoin } from '../tools/merge-tool/early-conflicts.mjs'
import { integrateGit as replayGitFixture, pinGit } from '../tools/merge-tool/integrate.mjs'
// This fixture measures the replay before it becomes a landing commit.
import { THE_INTEGRATION_A_TEST_GIVES } from './the-integration-reads-a-test-gives.ts'
const integrateGit = (entry: any, options: any = {}) => replayGitFixture(entry, { ...THE_INTEGRATION_A_TEST_GIVES, ...options, landing: false })
import { LIST_JOINS_SAID, LIST_JOIN_REFUSED, joinOneHunk, joinTheListTexts, joinTheListsInThisClone } from '../tools/merge-tool/list-join.mjs'
import { tryTheRebaseEarly } from '../tools/merge-tool/rebase-with-joins.mjs'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

const MESSAGES = 'src/server/lib/messages.ts'
const ZH = 'src/shared/words/zh-made-from.ts'
const CODE = 'src/synthetic.ts'
const OPS = 'src/shared/ops.ts'
/** A synthetic code file with `lines` where its imports are. */
const code = (...lines: string[]) => `// A synthetic code file.\n${lines.join('\n')}\n\nexport const USED = 1\n`
/** A synthetic list file. */
const ops = (...keys: string[]) => `export const SOME_OPS = {\n${keys.map((key) => `  ${key}: {},\n`).join('')}} as const\n`
/** A synthetic zh-made-from.ts, with each key's value. */
const zh = (...pairs: [string, string][]) => `export const ZH_MADE_FROM = {\n  translated: {\n${pairs.map(([key, value]) => `    ${JSON.stringify(key)}: ${JSON.stringify(value)},\n`).join('')}  },\n}\n`

/** The real three sides of a bounced file (tests/fixtures/list-join-tier-1, whose README says where each was cut). */
const realSides = (name: string) => (['ancestor', 'main', 'entry'] as const).map((side) => readFileSync(join(REPO, 'tests/fixtures/list-join-tier-1', `${name}.${side}.txt`), 'utf8'))
/** Whether `part` appears in `whole` in order, line by line, with other lines between allowed. */
function holdsInOrder(whole: string, part: string) {
  const lines = whole.split('\n')
  let at = 0
  for (const line of part.split('\n')) {
    while (at < lines.length && lines[at] !== line) at += 1
    if (at === lines.length) return false
    at += 1
  }
  return true
}

describe('the two bounces of 15 October', () => {
  it('joins the real imports of merge entry wxxhqYe3kPDu (commit b0741320b43f) with main dd4ecf4686d8\'s', () => {
    const [ancestor, main, entry] = realSides('messages')
    const joined = joinTheListTexts(MESSAGES, ancestor!, main!, entry!)
    if (!('text' in joined)) throw Error(joined.refused)
    expect(joined.joined).toEqual(["src/server/lib/messages.ts at line 40: both sides only added. Main added the name gte to the import from 'drizzle-orm'; the entry added 1 import line above it. Kept: the entry's line, then main's wider line."])
    expect(joined.rules).toEqual(['import widening'])
    const wider = "import { and, desc, eq, gte, inArray, isNotNull, isNull, ne, or, sql, type SQL } from 'drizzle-orm'\n"
    expect(main!.includes(wider), "main's wider line is in main's file").toBe(true)
    expect(joined.text).toBe(main!.replace(wider, "import { isAHandOverSentence } from '@shared/handles.ts'\n" + wider))
  })

  it('joins the real keys of merge entry igosHDrHgqv5 (commit 9988e05d1838) with main 8f37b85e1710\'s, in key order', () => {
    const [ancestor, main, entry] = realSides('zh-made-from')
    const joined = joinTheListTexts(ZH, ancestor!, main!, entry!)
    if (!('text' in joined)) throw Error(joined.refused)
    // The cut starts at line 10653 of each side, so its line 66 is line 10718 of the real file, where part 4 puts it.
    expect(joined.joined).toEqual(['src/shared/words/zh-made-from.ts at line 66: both sides only added. Main added 1 key and the entry 1; they are put in key order, as scripts/chinese-made-from.ts writes the file.'])
    expect(joined.rules).toEqual(['key order'])
    expect(holdsInOrder(joined.text, main!), "every line of main's, in main's order").toBe(true)
    expect(holdsInOrder(joined.text, entry!), "every line of the entry's, in its order").toBe(true)
    expect(joined.text.split('\n').length).toBe(main!.split('\n').length + entry!.split('\n').length - ancestor!.split('\n').length)
    const keys = joined.text.split('\n').flatMap((line) => /^    ("[^"]+"): /.exec(line)?.slice(1).map((key) => JSON.parse(key) as string) ?? [])
    expect(keys.every((key, i) => i === 0 || keys[i - 1]! < key), 'every key strictly after the one before it').toBe(true)
    expect(joined.text.indexOf('"settingsPanel.trusted.addressHint"'), "the entry's key goes before main's, as the key order has it").toBeLessThan(joined.text.indexOf('"terminals.typedFrom.onlyYou"'))
  })
})

describe('the rules on synthetic hunks', () => {
  it('joins two widenings of one import line into main\'s line, with the entry\'s new names before its brace in the entry\'s order (Q3)', () => {
    expect(joinTheListTexts(CODE, code('import {zeta, alpha} from "x";'), code('import {zeta, alpha, mid} from "x";'), code("import { zeta, alpha, yak, mid, beta } from 'x'"))).toEqual({
      text: code('import {zeta, alpha, mid, yak, beta} from "x";'),
      joined: ["src/synthetic.ts at line 2: both sides only added. Main added the name mid to the import from 'x'; the entry added the names yak, mid and beta to the import from 'x'. Kept: main's wider line with the entry's names added."],
      rules: ['import widening'],
    })
  })

  it('joins a list file\'s hunk whose ancestor lines both sides kept, main\'s new lines before the entry\'s at each place', () => {
    // git merge-file --diff3 wrote no such hunk in the cases tried for this round, where both sides only added, so the rule
    // is shown on the hunk itself.
    expect(joinOneHunk(OPS, 7, { main: ['  m1: {},', '  },', '  m2: {},'], ancestor: ['  },'], entry: ['  e1: {},', '  },', '  e2: {},'] })).toEqual({
      lines: ['  m1: {},', '  e1: {},', '  },', '  m2: {},', '  e2: {},'],
      rule: 'the whole-line check',
      said: "src/shared/ops.ts at line 7: both sides only added. Main added 2 lines and the entry 2, and both kept the ancestor's 1 line there as it was. Kept: main's lines before the entry's at each place.",
    })
  })

  it('refuses an import line that lost a name', () => {
    expect(joinTheListTexts(CODE, code("import { a, b } from 'x'"), code("import { a, b, c } from 'x'"), code("import { a } from 'x'"))).toEqual({
      refused: "src/synthetic.ts at line 2 was not joined by import widening: the entry changed the line `import { a, b } from 'x'` to `import { a } from 'x'`, which is not names added to the same import: it no longer has b, so it was left to git.",
    })
  })

  it('refuses an import from a different module, even one that adds a name', () => {
    expect(joinTheListTexts(CODE, code("import { a, b } from 'x'"), code("import { a, b, c } from 'x'"), code("import { a, b, d } from 'y'"))).toEqual({
      refused: "src/synthetic.ts at line 2 was not joined by import widening: the entry changed the line `import { a, b } from 'x'` to `import { a, b, d } from 'y'`, which is not names added to the same import: it imports from 'y', not 'x', so it was left to git.",
    })
  })

  it('refuses a name the two sides import from different modules', () => {
    expect(joinTheListTexts(CODE, code("import { a, b } from 'x'"), code("import { a, b, c } from 'x'"), code("import { a, b } from 'x'", "import { c } from 'y'"))).toEqual({
      refused: "src/synthetic.ts at line 2 was not joined by import widening: the name c would be imported from two modules, 'x' and 'y', so it was left to git.",
    })
  })

  it('refuses a line that is not an import, in a code file that is not a list file', () => {
    expect(joinTheListTexts(CODE, code("import { a, b } from 'x'"), code("import { a, b, c } from 'x'"), code("import { a, b } from 'x'", 'const z = 1'))).toEqual({
      refused: 'src/synthetic.ts at line 2 was not joined by import widening: the hunk holds `const z = 1`, which is not a one-line import, and the file is not a list file, so it was left to git.',
    })
  })

  it('refuses an import written over more than one line', () => {
    expect(joinTheListTexts(CODE, code("import { a, b } from 'x'"), code("import { a, b, c } from 'x'"), code("import { a, b } from 'x'", 'import {', '  q,', "} from 'z'"))).toEqual({
      refused: 'src/synthetic.ts at line 2 was not joined by import widening: the hunk holds `import {`, which begins an import written over more than one line, and the file is not a list file, so it was left to git.',
    })
  })

  it('refuses a changed line in a list file', () => {
    expect(joinTheListTexts(OPS, ops('a', 'b'), ops('a', 'b', 'mainAdded'), ops('a', 'bChanged', 'entryAdded'))).toEqual({
      refused: 'src/shared/ops.ts at line 3 was not joined by the whole-line check: the entry removed or changed the line `b: {},`, so it was left to git.',
    })
  })

  it('refuses one key with two values', () => {
    expect(joinTheListTexts(ZH, zh(['a', '1'], ['c', '3']), zh(['a', '1'], ['b', '2'], ['c', '3']), zh(['a', '1'], ['b', '9'], ['c', '3']))).toEqual({
      refused: 'src/shared/words/zh-made-from.ts at line 4 was not joined by key order: both sides added the key `"b"` with different values, so it was left to git.',
    })
  })

  it('keeps once a key both sides added with one value, and refuses keys that would not be in key order', () => {
    expect(joinTheListTexts(ZH, zh(['a', '1'], ['d', '4']), zh(['a', '1'], ['b', '2'], ['d', '4']), zh(['a', '1'], ['b', '2'], ['c', '3'], ['d', '4']))).toEqual({
      text: zh(['a', '1'], ['b', '2'], ['c', '3'], ['d', '4']),
      joined: ['src/shared/words/zh-made-from.ts at line 4: both sides only added. Main added 1 key and the entry 2, 1 that both added kept once; they are put in key order, as scripts/chinese-made-from.ts writes the file.'],
      rules: ['key order'],
    })
    expect(joinTheListTexts(ZH, zh(['a', '1'], ['d', '4']), zh(['a', '1'], ['e', '5'], ['d', '4']), zh(['a', '1'], ['b', '2'], ['d', '4']))).toEqual({
      refused: 'src/shared/words/zh-made-from.ts at line 4 was not joined by key order: the keys would not be strictly in key order at `"d": "4",`, so it was left to git.',
    })
  })
})

/** A repository where main and an entry each changed `files` from `base`; the entry is checked out. */
function aRepository(base: Record<string, string>, main: Record<string, string>, entry: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), 'synthetic-tier-1-join-'))
  roots.push(root)
  const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  const write = (files: Record<string, string>) => { for (const [path, text] of Object.entries(files)) { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text) } }
  const commit = (message: string) => { git('add', '-A'); git('commit', '-qm', message); return git('rev-parse', 'HEAD') }
  git('init', '-qb', 'main'); git('config', 'user.name', 'Synthetic fixture'); git('config', 'user.email', aTestAddress('fixture'))
  write(base); commit('Synthetic base')
  git('checkout', '-qb', 'entry'); write(entry); const tip = commit('Synthetic entry adds')
  git('checkout', '-q', 'main'); write(main); const mainAt = commit('Synthetic main adds')
  git('checkout', '-q', 'entry')
  const probe = (cwd: string, args: string[]) => { const r = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }); return { status: r.status, stdout: r.stdout, stderr: r.stderr } }
  return { root, git, tip, main: mainAt, probe }
}

const WIDENS = { base: { [CODE]: code("import { a, b } from 'x'") }, main: { [CODE]: code("import { a, b, c } from 'x'") }, entry: { [CODE]: code("import { a, b } from 'x'", "import { q } from 'z'") } }
const NOT_IMPORTS = { base: { [CODE]: code("import { a, b } from 'x'") }, main: { [CODE]: code("import { a, b, c } from 'x'") }, entry: { [CODE]: code("import { a, b } from 'x'", 'const z = 1') } }

describe('the driver in a real rebase', () => {
  function rebased(files: { base: Record<string, string>, main: Record<string, string>, entry: Record<string, string> }) {
    const made = aRepository(files.base, files.main, files.entry)
    joinTheListsInThisClone(made.root, (pair: string[]) => made.git('config', ...pair))
    const rebase = spawnSync('git', ['-C', made.root, 'rebase', '--quiet', made.main], { encoding: 'utf8' })
    const said = (name: string) => (existsSync(join(made.root, '.git', name)) ? readFileSync(join(made.root, '.git', name), 'utf8') : '')
    return { ...made, ok: rebase.status === 0, said }
  }

  it('joins a code file\'s imports and a list file\'s two hunks, and writes one line for each hunk joined', () => {
    const { root, ok, said } = rebased({
      base: { ...WIDENS.base, [OPS]: ops('a', 'b', 'c') },
      main: { ...WIDENS.main, [OPS]: ops('a', 'm1', 'b', 'c', 'm2') },
      entry: { ...WIDENS.entry, [OPS]: ops('a', 'e1', 'b', 'c', 'e2') },
    })
    expect(ok).toBe(true)
    expect(readFileSync(join(root, CODE), 'utf8')).toBe(code("import { a, b, c } from 'x'", "import { q } from 'z'"))
    expect(readFileSync(join(root, OPS), 'utf8')).toBe(ops('a', 'm1', 'e1', 'b', 'c', 'm2', 'e2'))
    // git calls the driver once for each file, in an order of its own, so the lines are compared sorted.
    expect(said(LIST_JOINS_SAID).endsWith('\n')).toBe(true)
    expect(said(LIST_JOINS_SAID).trimEnd().split('\n').sort()).toEqual([
      "joined src/shared/ops.ts at line 3: main's 1 added line and then the entry's 1",
      "joined src/shared/ops.ts at line 7: main's 1 added line and then the entry's 1",
      "joined src/synthetic.ts at line 2: both sides only added. Main added the name c to the import from 'x'; the entry added 1 import line below it. Kept: main's wider line, then the entry's line.",
    ])
    expect(said(LIST_JOIN_REFUSED)).toBe('')
  })

  it('stops on a code file\'s hunk that is not imports, and the refusal names the file, the line and the rule', () => {
    const { ok, said, git } = rebased(NOT_IMPORTS)
    expect(ok).toBe(false)
    expect(git('diff', '--name-only', '--diff-filter=U')).toBe(CODE)
    expect(said(LIST_JOIN_REFUSED)).toBe('src/synthetic.ts at line 2 was not joined by import widening: the hunk holds `const z = 1`, which is not a one-line import, and the file is not a list file, so it was left to git.\n')
    git('rebase', '--abort')
  })
})

describe('the pin\'s probe and the rebase', () => {
  function bothOf(files: { base: Record<string, string>, main: Record<string, string>, entry: Record<string, string> }) {
    const made = aRepository(files.base, files.main, files.entry)
    boundary.folder = mkdtempSync(join(tmpdir(), 'synthetic-tier-1-trial-'))
    roots.push(boundary.folder)
    mkdirSync(join(boundary.folder, 'logs')); boundary.logs = []
    return { made, probed: canItJoin(made.root, made.main, made.tip, made.probe), tried: tryTheRebaseEarly(made.root, made.main, made.tip, join(boundary.folder, 'trial')) }
  }

  it('agree that an import widening joins: the probe marks it, by its rule, and the rebase joins it', () => {
    const { probed, tried } = bothOf(WIDENS)
    expect(probed).toMatchObject({ joins: false, files: [CODE], mayRenumber: false, mayJoin: true, joinsBy: ['src/synthetic.ts (import widening)'] })
    expect(tried, boundary.logs.join('\n')).toEqual({ resolved: true })
  })

  it('agree that a hunk the driver refuses does not join: the probe does not mark it, and the rebase stops on it', () => {
    const { made, probed, tried } = bothOf(NOT_IMPORTS)
    expect(probed).toMatchObject({ joins: false, files: [CODE], mayRenumber: false })
    expect(probed).not.toHaveProperty('mayJoin')
    expect(tried).toMatchObject({
      resolved: false, files: [CODE],
      says: `git rebase ${made.main.slice(0, 12)} stopped on a conflict it does not resolve in src/synthetic.ts. src/synthetic.ts at line 2 was not joined by import widening: the hunk holds \`const z = 1\`, which is not a one-line import, and the file is not a list file, so it was left to git.`,
    })
  })
})

describe('through the queue\'s own integration', () => {
  it('lands an import join, and the run\'s log carries what the driver said', async () => {
    boundary.folder = mkdtempSync(join(tmpdir(), 'the-merge-tool-joins-add-only-conflicts-'))
    roots.push(boundary.folder)
    mkdirSync(join(boundary.folder, 'logs')); boundary.logs = []; boundary.state = {}
    const root = join(boundary.folder, 'repo')
    mkdirSync(root)
    const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
    const write = (path: string, text: string) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text) }
    const commit = (message: string) => { git('add', '-A'); git('commit', '-qm', message); return git('rev-parse', 'HEAD') }
    git('init', '-qb', 'main'); git('config', 'user.name', 'Synthetic fixture'); git('config', 'user.email', aTestAddress('fixture'))
    write('.mole-office/protected.json', JSON.stringify({ protected: [], generated: [] }))
    write('package.json', JSON.stringify({ private: true, scripts: { build: 'node build.cjs' } }))
    write('build.cjs', 'process.exit(0)\n')
    write(CODE, WIDENS.base[CODE])
    const base = commit('Synthetic base')
    git('switch', '-qc', 'entry'); write(CODE, WIDENS.entry[CODE]); const tip = commit('Synthetic entry adds an import line')
    git('switch', '-q', 'main'); write(CODE, WIDENS.main[CODE]); const main = commit('Synthetic main adds a name to an import')
    const entry = { changeset: { root, base, commit: tip }, seal: { id: 'synthetic-seal' }, machine: { judged: {} } }
    const pinned = await pinGit(entry, THE_INTEGRATION_A_TEST_GIVES)
    expect(pinned.step).toBe('pinned')
    expect(pinned.facts.cannotJoin, 'the pin-time probe leaves the join to the rebase').toBeUndefined()
    expect(boundary.logs).toContain(`the entry conflicts with main ${main} at its commit ${tip} only where the rebase may join it: src/synthetic.ts (import widening)`)
    const result = await integrateGit(entry)
    expect(result.step, JSON.stringify(result.facts)).toBe('integrated')
    expect(readFileSync(join(boundary.state.integrated.clone, CODE), 'utf8')).toBe(code("import { a, b, c } from 'x'", "import { q } from 'z'"))
    expect(boundary.logs).toContain("list files were joined by themselves, and the joined tree is checked and tested as any other: joined src/synthetic.ts at line 2: both sides only added. Main added the name c to the import from 'x'; the entry added 1 import line below it. Kept: main's wider line, then the entry's line.")
    expect(git('rev-parse', 'HEAD')).toBe(main)
  }, 120_000)
})
