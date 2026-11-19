// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * LIST FILES WHERE BOTH SIDES ONLY ADDED ARE JOINED (wave 13v round 22). From 8 October many "Bounced (conflict)"
 * messages named a list file where main and the entry had each added entries at one place and removed nothing. The
 * queue's rebase now joins such a hunk through a merge driver set in the integration clone (tools/merge-tool/list-join.mjs):
 * main's added lines first, then the entry's, and a whole line both added is kept once. Everything else stays git's.
 *
 * WHAT THIS FILE PROVES:
 * 1. The real shapes: wave 13n's refusal codes against main's, and a notices.ts bounce, each from the real commits, join.
 * 2. A hunk where one side changed a line is refused, with a sentence naming the file and the hunk.
 * 3. Two definitions of one name, added on both sides with different values, are refused.
 * 4. The same line added on both sides is kept once; a line inside a block is never dropped.
 * 5. In a real git rebase in a clone with the driver installed, a list file joins, a refused hunk still stops the rebase
 *    and says why in the clone's .git, and a file not on the list still stops as before.
 * 6. The early probe marks a stop only in list files that join as one the rebase may join, and not one that is refused.
 * 7. Every declared list file says why it is a list, and exists, or says which round makes it (wave 13u round 73: wave
 *    13s round 89 makes src/server/db/schema-parts/index.ts, which may land before or after its declaration).
 * 8. Through the queue's own integration (integrateGit): a join lands and is logged, a refused hunk bounces the entry
 *    with the sentence naming it, and a join that breaks the build is a failed guard, as any broken tree is. The guard
 *    is counted as the integrated-tree-builds gate at its default, block (wave 13r round L).
 */
import {execFileSync, spawnSync} from 'node:child_process'
import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {afterEach, describe, expect, it, vi} from 'vitest'
import { aTestAddress } from './the-test-commit-address.mjs'

const boundary = vi.hoisted(() => ({folder: '', logs: [] as string[], state: {} as Record<string, any>, counted: [] as unknown[][]}))
vi.mock('../tools/merge-tool/arguments.mjs', async () => ({
  theOwnerContentPatterns: async () => (await import('./the-owners-content-patterns.ts')).THE_PATTERNS,
  withThePairing: (env: Record<string, string | undefined>) => ({ ...env }),
  get WORKDIR() { return join(boundary.folder, 'logs') },
  THIS_CHECKOUT: fileURLToPath(new URL('..', import.meta.url)),
  ABSENT: 'absent', API: '', WORKSPACE: 'synthetic', PINNED_REF_PREFIX: 'refs/synthetic/',
  SCRIPT_TIMEOUT_MS: 30_000, SUITE_TIMEOUT_MS: 30_000,
  GIT_IDENTITY: (await import('./the-test-commit-address.mjs')).aTestIdentity('Synthetic queue', 'fixture'),
  chosen: {entry: 'synthetic-entry', pinOnly: false, get sandboxes() { return join(boundary.folder, 'sandboxes') }},
}))
vi.mock('../tools/merge-tool/log-and-state.mjs', () => ({
  fail: (words: string) => { throw Error(words) }, log: (words: string) => boundary.logs.push(words),
  stamp: () => '2026-10-11 00:00:00', writeState: (patch: Record<string, any>) => { boundary.state = patch },
}))
vi.mock('../tools/merge-tool/documents.mjs', () => ({theRecordOfMain: () => ({record: null}), theDocumentsOf: () => ({none: 'Synthetic code entry'})}))
vi.mock('../tools/merge-tool/office-keeper.mjs', () => ({
  theSeal: async (entry: any) => ({git: {commit: entry.changeset.commit, files: []}}),
  theSandbox: async () => { standIn('up', 'merge', '--name', 'synthetic-sandbox', '--from', boundary.folder); return {name: 'synthetic-sandbox', folder: join(boundary.folder, 'sandboxes', 'synthetic-sandbox')} },
  step: async (name: string, facts: Record<string, any>) => ({step: name, facts}),
  keepTheReport: () => { throw Error('No report copying in these fixtures') },
  // Each gate the build guard meets, with its position (wave 13r round L); nothing is sent to an office.
  countAGateMet: async (...args: unknown[]) => { boundary.counted.push(args); return {counted: true} },
  runInSandbox: async (_sandbox: any, label: string, command: string, args: string[], options: any) => {
    const result = standIn('exec', 'synthetic-sandbox', '--cwd', options.cwd, '--wait', '--plain-env', '--timeout', '30', '--', command, ...args)
    const outFile = join(boundary.folder, 'logs', label + '.log')
    writeFileSync(outFile, result.stdout + result.stderr)
    return {code: result.status, signal: result.signal, timedOut: false, outFile, tail: (result.stdout + result.stderr).split('\n').slice(-12).join('\n')}
  },
}))
function standIn(...args: string[]) {
  const cut = args.indexOf('--') < 0 ? args.length : args.indexOf('--')
  return spawnSync(process.execPath, [join(REPO, 'tests/stand-in-sandbox-tool.mjs'), ...args.slice(0, cut), '--sandboxes', join(boundary.folder, 'sandboxes'), ...args.slice(cut)], {encoding: 'utf8', timeout: 60_000})
}
import {canItJoin} from '../tools/merge-tool/early-conflicts.mjs'
import {integrateGit as replayGitFixture, pinGit} from '../tools/merge-tool/integrate.mjs'
// This fixture measures the replay before it becomes a landing commit.
import { THE_INTEGRATION_A_TEST_GIVES } from './the-integration-reads-a-test-gives.ts'
const integrateGit = (entry: any, options: any = {}) => replayGitFixture(entry, { ...THE_INTEGRATION_A_TEST_GIVES, ...options, landing: false })
import {LIST_JOINS_SAID, LIST_JOIN_REFUSED, THE_LIST_FILES, howAFileJoins, joinTheListTexts, joinTheListsInThisClone, theNameDefined} from '../tools/merge-tool/list-join.mjs'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, {recursive: true, force: true}) })

function aRepository() {
  const root = mkdtempSync(join(tmpdir(), 'synthetic-list-join-'))
  roots.push(root)
  const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], {encoding: 'utf8'}).trim()
  const write = (files: Record<string, string>) => { for (const [path, text] of Object.entries(files)) { mkdirSync(dirname(join(root, path)), {recursive: true}); writeFileSync(join(root, path), text) } }
  const commit = (message: string) => { git('add', '-A'); git('commit', '-qm', message); return git('rev-parse', 'HEAD') }
  git('init', '-qb', 'main'); git('config', 'user.name', 'Synthetic fixture'); git('config', 'user.email', aTestAddress('fixture'))
  const probe = (cwd: string, args: string[]) => { const r = spawnSync('git', ['-C', cwd, ...args], {encoding: 'utf8'}); return {status: r.status, stdout: r.stdout, stderr: r.stderr} }
  return {root, git, write, commit, probe}
}

const CODES = 'src/shared/refusal-codes.ts'
const codes = (...keys: string[]) => `export const SOME_REFUSAL_CODES = {\n${keys.map((key) => `  ${key}: {},\n`).join('')}} as const\n`

/** The real three sides of a bounced file, cut from one line before a common anchor to the end (tests/fixtures/list-join-round-22). */
const realSides = (name: string) => (['ancestor', 'main', 'entry'] as const).map((side) => readFileSync(join(REPO, 'tests/fixtures/list-join-round-22', `${name}.${side}.txt`), 'utf8'))
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

describe('the join of one file', () => {
  it('joins the real refusal codes of wave 13n (entry Oe7JZFCHpJly, commit a5bef51adf11) with main 4c2d37e354f9\'s', () => {
    const [ancestor, main, entry] = realSides('refusal-codes-13n')
    const joined = joinTheListTexts(CODES, ancestor!, main!, entry!)
    if (!('text' in joined)) throw Error(joined.refused)
    expect(joined.joined).toHaveLength(3)
    expect(holdsInOrder(joined.text, main!), "every line of main's, in main's order").toBe(true)
    expect(holdsInOrder(joined.text, entry!), "every line of the entry's, in its order").toBe(true)
    expect(joined.text.split('\n').length).toBe(main!.split('\n').length + entry!.split('\n').length - ancestor!.split('\n').length)
    expect(joined.text.indexOf('export const FLOW_WRITE_REFUSAL_CODES')).toBeLessThan(joined.text.indexOf('export const SHUT_DOWN_REFUSAL_CODES'))
  })

  it('joins the real notices of wave 13j (entry zTUTOBuAPziR, commit f3723027ef47) with main 9ccc2a22000d\'s, keeping once the line both added', () => {
    const [ancestor, main, entry] = realSides('notices-13j')
    const joined = joinTheListTexts('src/server/lib/notices.ts', ancestor!, main!, entry!)
    if (!('text' in joined)) throw Error(joined.refused)
    expect(joined.joined).toEqual(["src/server/lib/notices.ts at line 3: main's 2 added lines and then the entry's 0, 1 that both added kept once"])
    expect(joined.text, "main already holds the entry's one added line").toBe(main)
  })

  it('refuses a hunk where a side changed a line of the ancestor, naming the file and the hunk', () => {
    const joined = joinTheListTexts(CODES, codes('a', 'b'), codes('a', 'b', 'mainAdded'), codes('a', 'bChanged', 'entryAdded'))
    expect(joined).toEqual({refused: 'src/shared/refusal-codes.ts at line 3 was not joined by the whole-line check: the entry removed or changed the line `b: {},`, so it was left to git.'})
  })

  it('refuses two definitions of one name with different values', () => {
    const joined = joinTheListTexts(CODES, codes('a'), codes('a', 'twice'), codes('a').replace('  a: {},\n', '  a: {},\n  twice: { other: true },\n'))
    expect(joined).toEqual({refused: 'src/shared/refusal-codes.ts at line 3 was not joined by two additions at one place: main added `twice: {},` and the entry added `twice: { other: true },`, two definitions of `twice`, so it was left to git.'})
  })

  it('keeps once a line both sides added, and keeps main\'s lines before the entry\'s', () => {
    const joined = joinTheListTexts(CODES, codes('a'), codes('a', 'fromMain', 'both'), codes('a', 'both', 'fromEntry'))
    expect(joined).toEqual({text: codes('a', 'fromMain', 'both', 'fromEntry'), joined: ["src/shared/refusal-codes.ts at line 3: main's 2 added lines and then the entry's 1, 1 that both added kept once"], rules: ['two additions at one place']})
  })

  it('never drops a line inside a block, and refuses two blocks under one name', () => {
    const block = (name: string, inner: string) => `  ${name}: {\n    ${inner}\n  },\n`
    const file = (...blocks: string[]) => `export const WORDS = {\n${blocks.join('')}}\n`
    expect(joinTheListTexts('src/shared/words/en.ts', file(block('a', 'x: 1,')), file(block('a', 'x: 1,'), block('m', 'x: 1,')), file(block('a', 'x: 1,'), block('e', 'x: 1,')))).toEqual({
      text: file(block('a', 'x: 1,'), block('m', 'x: 1,'), block('e', 'x: 1,')), joined: ["src/shared/words/en.ts at line 5: main's 3 added lines and then the entry's 3"], rules: ['two additions at one place'],
    })
    expect(joinTheListTexts('src/shared/words/en.ts', file(block('a', 'x: 1,')), file(block('a', 'x: 1,'), block('same', 'x: 1,')), file(block('a', 'x: 1,'), block('same', 'x: 2,')))).toMatchObject({refused: expect.stringContaining('two definitions of `same`')})
  })

  it('reads the name a line defines in the shapes the declared files hold', () => {
    expect(['  shutdownNotAllowed: {},', "  'agent.inbox': 'GET /api/inbox',", '  [THE_KEY]: 1,', 'export const DONE_WHEN = 1', "  | 'aNotice'", "  'plain-entry',", 'await app.register(somethingRoutes, { prefix: "/api" })'].map(theNameDefined)).toEqual(['shutdownNotAllowed', 'agent.inbox', 'THE_KEY', 'DONE_WHEN', 'aNotice', 'plain-entry', null])
  })
})

describe('the driver in a real rebase', () => {
  function aClone(mainCodes: string, entryCodes: string, other?: {main: string, entry: string}) {
    const {root, git, write, commit} = aRepository()
    write({[CODES]: codes('a', 'b'), 'src/other.ts': 'export const OTHER = 1\n'}); const base = commit('Synthetic base')
    git('checkout', '-qb', 'entry'); write({[CODES]: entryCodes, ...(other ? {'src/other.ts': other.entry} : {})}); commit('Synthetic entry adds')
    git('checkout', '-q', 'main'); write({[CODES]: mainCodes, ...(other ? {'src/other.ts': other.main} : {})}); const main = commit('Synthetic main adds')
    git('checkout', '-q', 'entry')
    joinTheListsInThisClone(root, (pair: string[]) => git('config', ...pair))
    const rebase = spawnSync('git', ['-C', root, 'rebase', '--quiet', main], {encoding: 'utf8'})
    const said = (name: string) => (existsSync(join(root, '.git', name)) ? readFileSync(join(root, '.git', name), 'utf8') : '')
    return {root, git, base, main, ok: rebase.status === 0, said}
  }

  it('joins a list file where both sides only added, and says what it joined in the clone\'s .git', () => {
    const {root, ok, said} = aClone(codes('a', 'b', 'mainAdded'), codes('a', 'b', 'entryAdded'))
    expect(ok).toBe(true)
    expect(readFileSync(join(root, CODES), 'utf8')).toBe(codes('a', 'b', 'mainAdded', 'entryAdded'))
    expect(said(LIST_JOINS_SAID)).toBe("joined src/shared/refusal-codes.ts at line 4: main's 1 added line and then the entry's 1\n")
    expect(said(LIST_JOIN_REFUSED)).toBe('')
  })

  it('stops the rebase on a hunk a side changed, and the refusal names it', () => {
    const {ok, said, git} = aClone(codes('a', 'b', 'mainAdded'), codes('a', 'bChanged', 'entryAdded'))
    expect(ok).toBe(false)
    expect(git('diff', '--name-only', '--diff-filter=U')).toBe(CODES)
    expect(said(LIST_JOIN_REFUSED)).toContain('src/shared/refusal-codes.ts at line 3 was not joined by the whole-line check: the entry removed or changed the line `b: {},`, so it was left to git.')
    git('rebase', '--abort')
  })

  it('still stops on a file that is not on the list, though the list file joined', () => {
    const {ok, git} = aClone(codes('a', 'b', 'mainAdded'), codes('a', 'b', 'entryAdded'), {main: 'export const OTHER = 1\nexport const MAIN = 2\n', entry: 'export const OTHER = 1\nexport const ENTRY = 3\n'})
    expect(ok).toBe(false)
    expect(git('diff', '--name-only', '--diff-filter=U')).toBe('src/other.ts')
    git('rebase', '--abort')
  })
})

describe('the early probe', () => {
  function aStop(entryCodes: string) {
    const {root, git, write, commit, probe} = aRepository()
    write({[CODES]: codes('a', 'b')}); commit('Synthetic base')
    git('checkout', '-qb', 'entry'); write({[CODES]: entryCodes}); const tip = commit('Synthetic entry adds')
    git('checkout', '-q', 'main'); write({[CODES]: codes('a', 'b', 'mainAdded')}); const main = commit('Synthetic main adds')
    return canItJoin(root, main, tip, probe)
  }

  it('marks a stop only where both sides added to a list file as one the rebase may join', () => {
    expect(aStop(codes('a', 'b', 'entryAdded'))).toMatchObject({joins: false, files: [CODES], mayRenumber: false, mayJoin: true})
  })

  it('does not mark a stop the join refuses', () => {
    expect(aStop(codes('a', 'bChanged', 'entryAdded'))).not.toHaveProperty('mayJoin')
  })
})


describe('through the queue\'s own integration', () => {
  /** A repository whose main added `mainAdded` to the codes and an entry that writes `entryCodes`; its build fails on `breaks`. */
  async function integrated(entryCodes: string) {
    boundary.folder = mkdtempSync(join(tmpdir(), 'the-merge-tool-joins-list-files-'))
    roots.push(boundary.folder)
    mkdirSync(join(boundary.folder, 'logs')); boundary.logs = []; boundary.state = {}; boundary.counted = []
    const root = join(boundary.folder, 'repo')
    mkdirSync(root)
    const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim()
    const write = (path: string, text: string) => { mkdirSync(dirname(join(root, path)), {recursive: true}); writeFileSync(join(root, path), text) }
    const commit = (message: string) => { git('add', '-A'); git('commit', '-qm', message); return git('rev-parse', 'HEAD') }
    git('init', '-qb', 'main'); git('config', 'user.name', 'Synthetic fixture'); git('config', 'user.email', aTestAddress('fixture'))
    write('.mole-office/protected.json', JSON.stringify({protected: [], generated: []}))
    write('package.json', JSON.stringify({private: true, scripts: {build: 'node build.cjs'}}))
    write('build.cjs', `process.exit(require('fs').readFileSync('${CODES}', 'utf8').includes('breaks') ? 1 : 0)\n`)
    write(CODES, codes('a', 'b'))
    const base = commit('Synthetic base')
    git('switch', '-qc', 'entry'); write(CODES, entryCodes); const tip = commit('Synthetic entry adds codes')
    git('switch', '-q', 'main'); write(CODES, codes('a', 'b', 'mainAdded')); const main = commit('Synthetic main adds a code')
    const entry = {changeset: {root, base, commit: tip}, seal: {id: 'synthetic-seal'}, machine: {judged: {}}}
    const pinned = await pinGit(entry, THE_INTEGRATION_A_TEST_GIVES)
    expect(pinned.step).toBe('pinned')
    const result = await integrateGit(entry)
    return {pinned, result, main, git}
  }

  it('joins a list file in the integration clone, logs it, and leaves main where it was', async () => {
    const {pinned, result, main, git} = await integrated(codes('a', 'b', 'entryAdded'))
    expect(pinned.facts.cannotJoin, 'the pin-time probe leaves a join to the rebase').toBeUndefined()
    expect(result.step, JSON.stringify(result.facts)).toBe('integrated')
    expect(readFileSync(join(boundary.state.integrated.clone, CODES), 'utf8')).toBe(codes('a', 'b', 'mainAdded', 'entryAdded'))
    expect(boundary.logs).toContain("list files were joined by themselves, and the joined tree is checked and tested as any other: joined src/shared/refusal-codes.ts at line 4: main's 1 added line and then the entry's 1")
    expect(git('rev-parse', 'HEAD')).toBe(main)
  }, 120_000)

  it('bounces a hunk the join refuses, and the conflict says which hunk', async () => {
    const {pinned, result} = await integrated(codes('a', 'bChanged', 'entryAdded'))
    expect(pinned.facts.cannotJoin?.files, 'the pin-time probe sends a refused hunk back at once').toEqual([CODES])
    expect(result.step).toBe('conflict')
    expect(result.facts.files).toEqual([CODES])
    expect(result.facts.says).toContain('stopped on a conflict it does not resolve in src/shared/refusal-codes.ts. src/shared/refusal-codes.ts at line 3 was not joined by the whole-line check: the entry removed or changed the line `b: {},`, so it was left to git.')
  }, 120_000)

  it('fails the build guard when a join breaks the tree, as any broken tree does', async () => {
    const {result} = await integrated(codes('a', 'b', 'breaks'))
    expect(result.step, JSON.stringify(result.facts)).toBe('guard-failed')
    expect(result.facts.guard).toBe('build')
    expect(boundary.counted, 'the integrated-tree-builds gate is met at its default, block').toEqual([['integrated-tree-builds', 'block']])
    expect(boundary.logs.join('\n')).toContain('list files were joined by themselves')
  }, 120_000)
})
