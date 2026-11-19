// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHECK TOOL ASKS FOR A STANDARD RELEASE (wave 13r round F; tools/standard-change.mjs).
 *
 * A git seal may declare a standard kind. The check tool reads what the office cannot (the protected list, the test
 * cases each changed test file lost, whether a word file changed only words), runs the kind's own checks when the
 * switch is on and the rule matches, and asks the release door. Here the office and the checks are made up, and the
 * repository is a throwaway one in the system's temporary folder. Every path, title and word is made up.
 *
 * The last two parts run the real tool, tools/the-inspector.mjs, on the host against tests/inspector-tool-fixture.ts, a
 * labelled stand-in office, and runInside against tests/inspector-view-stand-in.ts, a labelled stand-in sandbox view. The
 * related tests are a made-up command in the fixture's repository, which runs no test and keeps where and how it was
 * started. The model is a stand-in claude on PATH, which runs no model and keeps each time it was started.
 */
import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { TRACED_HOW } from '../src/shared/releasing.ts'
import { A_STANDARD_CHECK, runInside } from '../tools/inspector-sandbox.mjs'
import { aMadeUpCheckSession, inspectorFixture } from './inspector-tool-fixture.ts'
import { inspectorViewStandIn } from './inspector-view-stand-in.ts'
import {
  A_CHANGED_TESTS_LIMIT_MS,
  A_CHANGED_TESTS_PREPARE_LIMIT_MS,
  A_CHECKS_LIMIT_MS,
  askForAStandardRelease,
  theCasesRemoved,
  theChecksOfAKind,
  whatTheToolReadsOfAChange,
  whetherOnlyWordsChanged,
} from '../tools/standard-change.mjs'
import { runAStandardCheckAsAChild, runASandboxStandardCheck, theKeptOutputSays, thePreparationLimit, theTimeLeft } from '../tools/standard-check-runs.mjs'
import { THE_CHECKS_OF_A_STANDARD_KIND, STANDARD_KINDS, type StandardKind } from '../src/shared/standard-change.ts'

const made = mkdtempSync(join(tmpdir(), 'standard-change-tool-'))
const repo = join(made, 'repo')
const git = (args: string[]): string => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', env: { ...process.env, HOME: made, GIT_CONFIG_NOSYSTEM: '1' } })

function write(files: Record<string, string>): void {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(repo, path)), { recursive: true })
    writeFileSync(join(repo, path), text)
  }
}
function commit(message: string): string {
  git(['add', '-A'])
  git(['commit', '-qm', message])
  return git(['rev-parse', 'HEAD']).trim()
}

function thePhasesAt(path: string): string[] {
  try {
    return readFileSync(path, 'utf8').trim().split('\n').filter((line) => line !== '')
  } catch {
    return []
  }
}

async function waitForAFile(path: string, ms: number): Promise<void> {
  const deadline = process.hrtime.bigint() + BigInt(ms) * 1_000_000n
  while (process.hrtime.bigint() < deadline) {
    if (existsSync(path)) return
    await new Promise((done) => setImmediate(done))
  }
  throw new Error(`The fixture did not write ${basename(path)} within ${String(ms)} milliseconds.`)
}

function aRecordedGroupAt(path: string): { child: number; group: number; grand: number } | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as { child: number; group: number; grand: number }
  } catch {
    return null
  }
}

function theProcessIsGone(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return false
  } catch {
    return true
  }
}

async function waitUntilGone(pid: number, ms: number): Promise<void> {
  const deadline = process.hrtime.bigint() + BigInt(ms) * 1_000_000n
  while (process.hrtime.bigint() < deadline) {
    if (theProcessIsGone(pid)) return
    await new Promise((done) => setImmediate(done))
  }
  throw new Error(`The fixture's process ${String(pid)} was still there after ${String(ms)} milliseconds.`)
}

const A_TEST = `import { it } from 'vitest'
it('says hello to a made-up person', () => {})
it(\`counts \${'made-up'} things\`, () => {})
it('waves', () => {})
`
const A_WORD_LIST = `import { more } from './more.ts'
export const EN = {
  'made-up.hello': 'Hello',
  'made-up.count': { one: '{n} thing', other: '{n} things' },
  'made-up.see': more.see,
}
export const say = (n: number) => \`\${String(n)} made-up\`
`
let base = ''

beforeAll(() => {
  mkdirSync(repo, { recursive: true })
  git(['init', '-q', '-b', 'main'])
  git(['config', 'user.name', 'Synthetic standard-change test'])
  git(['config', 'user.email', 'standard@example.invalid'])
  git(['config', 'commit.gpgsign', 'false'])
  write({
    '.mole-office/protected.json': JSON.stringify({
      why: 'Made up for this test.',
      protected: ['design/'],
      generated: [{ paths: ['docs/made-up-generated.md'], command: ['node', 'tools/made-up-writer.mjs'], why: 'Made up.' }],
    }),
    'tests/made-up-thing.test.ts': A_TEST,
    'tests/made-up-gone.test.ts': A_TEST,
    'src/shared/words/en-made-up.ts': A_WORD_LIST,
    'docs/made-up-guide.md': 'A made-up guide.\n',
  })
  base = commit('Synthetic base')
})

afterAll(() => rmSync(made, { recursive: true, force: true }))

describe('the test cases a change removes', () => {
  it('names a removed case, a renamed one, a template title and a case newly skipped; a new file loses nothing', () => {
    expect(theCasesRemoved(A_TEST, A_TEST)).toEqual([])
    expect(theCasesRemoved(A_TEST, A_TEST.replace("it('waves', () => {})\n", ''))).toEqual(['"waves"'])
    expect(theCasesRemoved(A_TEST, A_TEST.replace("'waves'", "'waves twice'"))).toEqual(['"waves"'])
    expect(theCasesRemoved(A_TEST, A_TEST.replace(/it\(`counts[^\n]*\n/u, ''))).toEqual(['"counts …"'])
    expect(theCasesRemoved(A_TEST, A_TEST.replace("it('waves'", "it.skip('waves'"))).toEqual(['1 more .skip'])
    expect(theCasesRemoved(A_TEST, `${A_TEST}it('is added', () => {})\n`)).toEqual([])
    expect(theCasesRemoved(null, A_TEST)).toEqual([])
    // A member named it is not a case, and a regular expression holding a quote is read as one token.
    expect(theCasesRemoved(`${A_TEST}x.it('not a case')\nconst r = /'/u\n`, A_TEST)).toEqual([])
  })
})

describe('whether only words changed', () => {
  it('passes changed, added and removed word entries', () => {
    expect(whetherOnlyWordsChanged(A_WORD_LIST, A_WORD_LIST.replace("'Hello'", "'Hello there'"))).toEqual({ plain: true, why: 'Only words changed.' })
    expect(whetherOnlyWordsChanged(A_WORD_LIST, A_WORD_LIST.replace("  'made-up.see'", "  'made-up.new': 'New',\n  'made-up.see'")).plain).toBe(true)
    expect(whetherOnlyWordsChanged(A_WORD_LIST, A_WORD_LIST.replace("  'made-up.hello': 'Hello',\n", '')).plain).toBe(true)
    expect(whetherOnlyWordsChanged(A_WORD_LIST, A_WORD_LIST.replace('made-up`', 'made up`')).plain).toBe(true)
    expect(whetherOnlyWordsChanged(null, A_WORD_LIST).plain).toBe(false)
  })

  it('names the line where code changed, and says a deleted word file is not words', () => {
    expect(whetherOnlyWordsChanged(A_WORD_LIST, A_WORD_LIST.replace("'./more.ts'", "'./other.ts'"))).toEqual({ plain: false, why: 'line 1 changes code, not a word' })
    expect(whetherOnlyWordsChanged(A_WORD_LIST, A_WORD_LIST.replace('String(n)', 'String(n + 1)'))).toEqual({ plain: false, why: 'line 7 changes code, not a word' })
    expect(whetherOnlyWordsChanged(A_WORD_LIST, A_WORD_LIST.replace("'made-up.see': more.see", "'made-up.see': more.see()")).plain).toBe(false)
    expect(whetherOnlyWordsChanged(A_WORD_LIST, null)).toEqual({ plain: false, why: 'the file is deleted' })
  })
})

describe('what the tool reads of a change', () => {
  it('names the protected, generated and queue paths, the cases each test file lost and whether each word file changed only words', () => {
    git(['switch', '-qc', 'reads-a-change', base])
    write({
      'design/made-up.md': 'Made up.\n',
      'docs/made-up-generated.md': 'Made up.\n',
      'tools/merge-tool/documents.mjs': '// made up\n',
      'tests/made-up-thing.test.ts': A_TEST.replace("it('waves', () => {})\n", ''),
      'tests/made-up-new.test.ts': A_TEST,
      'src/shared/words/en-made-up.ts': A_WORD_LIST.replace("'./more.ts'", "'./other.ts'"),
    })
    rmSync(join(repo, 'tests/made-up-gone.test.ts'))
    const tip = commit('Synthetic change')
    const { changed, read } = whatTheToolReadsOfAChange({ git: (args: string[]) => git(args), base, tip })
    expect(changed).toEqual([
      { path: 'design/made-up.md', deleted: false },
      { path: 'docs/made-up-generated.md', deleted: false },
      { path: 'src/shared/words/en-made-up.ts', deleted: false },
      { path: 'tests/made-up-gone.test.ts', deleted: true },
      { path: 'tests/made-up-new.test.ts', deleted: false },
      { path: 'tests/made-up-thing.test.ts', deleted: false },
      { path: 'tools/merge-tool/documents.mjs', deleted: false },
    ])
    expect(read.neverStandard).toEqual([
      { path: 'design/made-up.md', why: 'it is protected by design/ in .mole-office/protected.json' },
      { path: 'docs/made-up-generated.md', why: 'it is written by node tools/made-up-writer.mjs' },
      { path: 'tools/merge-tool/documents.mjs', why: "it is the merge queue's own code" },
    ])
    expect(read.cases).toEqual([
      { path: 'tests/made-up-new.test.ts', removed: [] },
      { path: 'tests/made-up-thing.test.ts', removed: ['"waves"'] },
    ])
    expect(read.words).toEqual([{ path: 'src/shared/words/en-made-up.ts', plain: false, why: 'line 1 changes code, not a word' }])
  })
})

describe('the checks of each kind', () => {
  it('names each kind\'s own checks in their order, and the changed test check only when a test under tests/ changed', () => {
    const pathsOf: Record<StandardKind, { path: string; deleted: boolean }[]> = {
      'one-plugin': [{ path: 'plugins/made-up/src/a.ts', deleted: false }],
      words: [{ path: 'src/shared/words/en-made-up.ts', deleted: false }],
      tests: [{ path: 'tests/made-up-thing.test.ts', deleted: false }],
      documents: [{ path: 'docs/made-up-guide.md', deleted: false }],
    }
    for (const kind of STANDARD_KINDS) {
      const named = theChecksOfAKind(kind, pathsOf[kind], 'abc123').map((one: { name: string }) => one.name)
      expect(named, kind).toEqual(THE_CHECKS_OF_A_STANDARD_KIND[kind].filter((name) => name !== 'changed-tests' || kind === 'tests'))
    }
  })

  it('runs only a changed test under tests/, never the related list, and never a helper or a plugin\'s own tests folder', () => {
    expect(theChecksOfAKind('tests', [
      { path: 'tests/made-up-thing.test.ts', deleted: false },
      { path: 'tests/made-up-helper.ts', deleted: false },
      { path: 'tests/made-up-gone.test.ts', deleted: true },
      { path: 'src/made-up.ts', deleted: false },
    ], 'abc123')).toEqual([
      {
        name: 'changed-tests',
        argv: ['node', 'tools/run-named-tests.mjs', 'tests/made-up-thing.test.ts'],
        prepare: { argv: ['node_modules/.bin/vite', 'build'], limitMs: A_CHANGED_TESTS_PREPARE_LIMIT_MS },
      },
    ])
    // tools/run-named-tests.mjs takes only a path under the checkout's tests/, so a plugin's own tests folder is not a
    // runnable name: a one-plugin change keeps its own check and the secret scan, and the queue's related run is its proof.
    expect(theChecksOfAKind('one-plugin', [
      { path: 'plugins/made-up/src/a.ts', deleted: false },
      { path: 'plugins/made-up/tests/made-up-thing.test.ts', deleted: false },
      { path: 'plugins/made-up/tests/made-up-helper.ts', deleted: false },
    ], 'abc123').map((one) => one.name)).toEqual(['check-a-plugin', 'secret-scan'])
    for (const one of [...theChecksOfAKind('one-plugin', [{ path: 'plugins/made-up/src/a.ts', deleted: false }], 'abc123'), ...theChecksOfAKind('tests', [{ path: 'tests/made-up-thing.test.ts', deleted: false }], 'abc123')]) {
      expect(one.argv).not.toContain('--list')
      expect(one.argv).not.toContain('related')
    }
  })

  it('names no test command when no changed file is a runnable test, and never an empty runner', () => {
    expect(theChecksOfAKind('tests', [{ path: 'tests/made-up-helper.ts', deleted: false }], 'abc123')).toEqual([])
    expect(theChecksOfAKind('documents', [{ path: 'docs/made-up-guide.md', deleted: false }], 'abc123')).toEqual([])
    expect(theChecksOfAKind('words', [{ path: 'src/shared/words/en-made-up.ts', deleted: false }], 'abc123')).toEqual([
      { name: 'tsc', argv: ['node_modules/.bin/tsc', '--noEmit'] },
    ])
  })

  it('keeps the plugin check and the words type check, and gives the changed test check a bound', () => {
    expect(theChecksOfAKind('one-plugin', [{ path: 'plugins/made-up/src/a.ts', deleted: false }], 'abc123').slice(0, 2)).toEqual([
      { name: 'check-a-plugin', argv: ['node', 'tools/check-a-plugin.mjs', 'made-up', '--json'] },
      { name: 'secret-scan', argv: ['node', 'tools/secret-scan.mjs', 'plugins/made-up', '--json'] },
    ])
    expect(theChecksOfAKind('words', [{ path: 'src/shared/words/en-made-up.ts', deleted: false }], 'abc123')[0]).toEqual({ name: 'tsc', argv: ['node_modules/.bin/tsc', '--noEmit'] })
    expect(A_CHECKS_LIMIT_MS['changed-tests']).toBe(A_CHANGED_TESTS_LIMIT_MS)
    expect(A_CHANGED_TESTS_PREPARE_LIMIT_MS).toBeLessThan(A_CHANGED_TESTS_LIMIT_MS)
    expect(theChecksOfAKind('tests', [{ path: 'tests/made-up-thing.test.ts', deleted: false }], 'abc123')[0]!.prepare).toEqual({
      argv: ['node_modules/.bin/vite', 'build'],
      limitMs: A_CHANGED_TESTS_PREPARE_LIMIT_MS,
    })
  })
})

describe('asking the release door', () => {
  /** A made-up office: the gate list with the four switches at `on`, and a door answering `door`. */
  function anOffice(on: Record<string, string>, door: { status: number; said: unknown }) {
    const asked: { method: string; path: string; body?: Record<string, unknown> }[] = []
    const rows = Object.entries(on).map(([id, value]) => ({ id, value }))
    const office = async (method: string, path: string, body?: Record<string, unknown>) => {
      asked.push({ method, path, ...(body === undefined ? {} : { body }) })
      if (method === 'GET' && path === '/api/office/gates') return { ok: true, status: 200, said: JSON.stringify({ classes: [{ class: 'process', groups: [{ group: 'standard-changes', rows }] }] }) }
      return { ok: door.status < 300, status: door.status, said: JSON.stringify(door.said) }
    }
    return { asked, office }
  }
  const ON = { 'standard-one-plugin': '1', 'standard-words': '1', 'standard-tests': '1', 'standard-documents': '1' }
  const READ = { sealKind: 'git', sealId: 'made-up-seal', sealHash: 'made-up-hash', worktree: '/made/up', tip: 'made-up-tip', ofItsOwn: true, says: 'Made up.' }

  /** A change on its own branch from the base, and what the door and the checks were asked. */
  async function ask(kind: string, files: Record<string, string>, on: Record<string, string>, door: { status: number; said: unknown }, codes: Record<string, number | null> = {}) {
    git(['switch', '-qc', `ask-${String(Math.random()).slice(2)}`, base])
    write(files)
    const tip = commit('Synthetic change')
    const { asked, office } = anOffice(on, door)
    const ran: string[] = []
    const limits: number[] = []
    const runACheck = async ({ name, limitMs }: { name: string; limitMs: number }) => {
      ran.push(name)
      limits.push(limitMs)
      const code = name in codes ? codes[name]! : 0
      return { code, seconds: 1.25, said: code === 0 ? '' : `${name} failed (made up).` }
    }
    const said: string[] = []
    const answer = await askForAStandardRelease({ run: 'made-up-run', kind, base, tip, read: READ, git: (args: string[]) => git(args), runACheck, office, say: (line: string) => said.push(line) })
    const posted = asked.find((one) => one.method === 'POST')
    return { answer, ran, limits, posted, said }
  }

  it('runs the changed test check of a matching kind in order, sends it to the door, and is released on its 201', async () => {
    const { answer, ran, limits, posted } = await ask('tests', { 'tests/made-up-thing.test.ts': `${A_TEST}it('is added', () => {})\n` }, ON, { status: 201, said: { says: 'Released as a standard change.' } })
    expect(ran).toEqual(['changed-tests'])
    expect(limits).toEqual([A_CHECKS_LIMIT_MS['changed-tests']])
    expect(posted?.path).toBe('/api/checks/made-up-run/standard')
    expect(posted?.body).toMatchObject({ kind: 'tests', read: READ, checks: [{ name: 'changed-tests', argv: ['node', 'tools/run-named-tests.mjs', 'tests/made-up-thing.test.ts'], code: 0, seconds: 1.3 }] })
    expect((posted?.body?.['toolRead'] as { cases: unknown }).cases).toEqual([{ path: 'tests/made-up-thing.test.ts', removed: [] }])
    expect(answer).toEqual({ released: true, why: 'Released as a standard change.' })
  })

  it('runs no test command for a helper-only tests change, says why, and still asks the door', async () => {
    const { answer, ran, limits, posted, said } = await ask('tests', { 'tests/made-up-helper.ts': 'export const madeUp = 1\n' }, ON, { status: 409, said: { error: 'changed-tests did not run' } })
    expect(ran).toEqual([])
    expect(limits).toEqual([])
    expect(posted?.body?.['checks']).toEqual([])
    expect(said.join('\n')).toContain('no changed file is a runnable test file')
    expect(said.join('\n')).toContain("merge queue's related run")
    expect(answer.released).toBe(false)
    expect(answer.why).toContain('changed-tests did not run')
  })

  it('goes the ordinary way in words when an older office still asks for related-tests', async () => {
    const { answer, ran, posted, said } = await ask('tests', { 'tests/made-up-thing.test.ts': `${A_TEST}it('is added', () => {})\n` }, ON, { status: 409, said: { error: 'related-tests did not run, so it goes the ordinary way.' } })
    expect(ran).toEqual(['changed-tests'])
    expect(posted?.body?.['checks']).toMatchObject([{ name: 'changed-tests' }])
    expect(said.join('\n')).toContain('changed-tests')
    expect(answer.released).toBe(false)
    expect(answer.why).toContain('related-tests did not run')
    expect(answer.why).toContain('goes the ordinary way')
  })

  it('runs no check when a tests declaration changes a file outside tests/', async () => {
    const { ran, posted, said } = await ask('tests', { 'src/made-up.ts': 'export const madeUp = 1\n' }, ON, { status: 409, said: { error: 'not a tests change' } })
    expect(ran).toEqual([])
    expect(posted?.body?.['checks']).toEqual([])
    expect(said.join('\n')).toContain('no check was run, because It is declared a change only to tests')
  })

  it('stops at the first check that fails, and still asks the door', async () => {
    const { answer, ran, posted } = await ask(
      'one-plugin',
      { 'plugins/made-up/src/a.ts': 'export const a = 1\n' },
      ON,
      { status: 409, said: { error: 'The check check-a-plugin exited 1.' } },
      { 'check-a-plugin': 1 },
    )
    expect(ran).toEqual(['check-a-plugin'])
    expect(posted?.body?.['checks']).toEqual([{ name: 'check-a-plugin', argv: ['node', 'tools/check-a-plugin.mjs', 'made-up', '--json'], code: 1, seconds: 1.3 }])
    expect(answer.released).toBe(false)
    expect(answer.why).toBe('The release door did not release it as a standard change (HTTP 409): The check check-a-plugin exited 1. The check goes the ordinary way.')
  })

  it('runs no check for a change outside its kind, and the door is asked so the office counts it', async () => {
    const { answer, ran, posted, said } = await ask('documents', { 'docs/made-up-guide.md': 'Changed.\n', 'src/made-up.ts': 'export {}\n' }, ON, { status: 409, said: { error: 'It is not a standard change.' } })
    expect(ran).toEqual([])
    expect(posted?.body?.['checks']).toEqual([])
    expect(said.join('\n')).toContain('no check was run, because It is declared a change only to documents, but src/made-up.ts is not a document')
    expect(answer.released).toBe(false)
  })

  it('names a deleted test file as deleted, runs no check, asks the door with no checks and is released on its 201', async () => {
    git(['switch', '-qc', 'deletes-a-test', base])
    rmSync(join(repo, 'tests/made-up-gone.test.ts'))
    const tip = commit('Synthetic deletion')
    const { office, asked } = anOffice(ON, { status: 201, said: { says: 'Synthetic: released as a standard change.' } })
    const ran: string[] = []
    const said: string[] = []
    const answer = await askForAStandardRelease({ run: 'made-up-run', kind: 'tests', base, tip, read: READ, git: (args: string[]) => git(args), runACheck: async ({ name }: { name: string }) => { ran.push(name); return { code: 0, seconds: 1, said: '' } }, office, say: (line: string) => said.push(line) })
    expect(ran).toEqual([])
    expect(said.join('\n')).toContain('tests/made-up-gone.test.ts is deleted')
    const posted = asked.find((one) => one.method === 'POST')
    expect(posted?.path).toBe('/api/checks/made-up-run/standard')
    expect(posted?.body?.['checks']).toEqual([])
    expect(answer).toEqual({ released: true, why: 'Synthetic: released as a standard change.' })
  })

  it('runs no check when the switch is off, and still asks the door', async () => {
    const { answer, ran, posted, said } = await ask('documents', { 'docs/made-up-guide.md': 'Changed.\n' }, { ...ON, 'standard-documents': '0' }, { status: 409, said: { error: 'The switch is off.' } })
    expect(ran).toEqual([])
    expect(posted?.body?.['checks']).toEqual([])
    expect(said.join('\n')).toContain('no check was run, because the switch standard-documents is off')
    expect(answer.released).toBe(false)
  })

  it('goes the ordinary way without asking the door when the office lists no switch for the kind', async () => {
    const { answer, ran, posted } = await ask('documents', { 'docs/made-up-guide.md': 'Changed.\n' }, {}, { status: 201, said: { says: 'never asked' } })
    expect(ran).toEqual([])
    expect(posted).toBeUndefined()
    expect(answer).toEqual({ released: false, why: 'The seal declares a standard change of the kind documents, but the office lists no switch standard-documents, so the check goes the ordinary way.' })
  })
})

describe('the real check tool', () => {
  type Fixture = Awaited<ReturnType<typeof inspectorFixture>>
  let f: Fixture | null = null
  afterEach(async () => {
    await f?.close()
    f = null
  })
  const A_MADE_UP_TOKEN = 'made-up-claude-token-not-a-real-one'

  /** The made-up runner the fork base holds: it runs no test, and keeps where and how it was started and what it said. */
  const aMadeUpRunner = (ranTheTests: string): string => [
    '// A made-up stand-in for the tests, written by a test. It runs no test: it keeps where and how it was started.',
    "import { writeFileSync } from 'node:fs'",
    `writeFileSync(${JSON.stringify(ranTheTests)}, JSON.stringify({ cwd: process.cwd(), argv: process.argv.slice(2), token: process.env.CLAUDE_CODE_OAUTH_TOKEN ?? null }))`,
    "console.log('The made-up runner ran.')",
  ].join('\n') + '\n'

  /**
   * THE FIXTURE'S REPOSITORY WITH `files` CHANGED, sealed as git with `declared` as its standard kind. The fork base
   * holds a made-up tools/run-named-tests.mjs (`runner` may replace it) that runs no test and writes where and how it was
   * started, and whether it was handed the made-up token. `checkLog` gives the reading the check's own log, so the tool
   * can keep the standard check's full output beside it. The standard door keeps each ask and answers `door`; the verdict
   * door keeps each verdict and answers 201. The model is a stand-in that answers a made-up release.
   */
  async function aSealedDocument(
    declared: string | undefined,
    door: { status: number; said: unknown },
    {
      files = { 'made-up-notes.md': 'A made-up note.\n' },
      runner = null,
      checkLog = null,
      withFakeVite = false,
      requiresBuiltPage = false,
    }: { files?: Record<string, string>; runner?: string | null; checkLog?: string | null; withFakeVite?: boolean; requiresBuiltPage?: boolean } = {},
  ) {
    f = await inspectorFixture()
    const fixture = f
    const ranTheTests = join(fixture.home, 'the-related-tests-ran.json')
    if (withFakeVite) {
      mkdirSync(join(fixture.checkout, 'node_modules/.bin'), { recursive: true })
      writeFileSync(
        join(fixture.checkout, 'node_modules/.bin/vite'),
        [
          `#!${process.execPath}`,
          "import { mkdirSync, writeFileSync } from 'node:fs'",
          "mkdirSync('dist/web', { recursive: true })",
          "writeFileSync('dist/web/index.html', 'made-up built page\\n')",
          "console.log('made-up vite build ran')",
        ].join('\n') + '\n',
        { mode: 0o755 },
      )
    }
    const aRunner = requiresBuiltPage
      ? [
          "import { existsSync, writeFileSync } from 'node:fs'",
          "if (!existsSync('dist/web/index.html')) { console.error('dist/web is not there: no build preparation ran'); process.exit(1) }",
          `writeFileSync(${JSON.stringify(ranTheTests)}, JSON.stringify({ cwd: process.cwd(), argv: process.argv.slice(2), token: process.env.CLAUDE_CODE_OAUTH_TOKEN ?? null }))`,
          "console.log('The made-up test runner found the built page.')",
        ].join('\n') + '\n'
      : runner ?? aMadeUpRunner(ranTheTests)
    mkdirSync(join(fixture.checkout, 'tools'))
    writeFileSync(join(fixture.checkout, 'tools/run-named-tests.mjs'), aRunner)
    fixture.git('add', '.')
    fixture.git('commit', '-qm', 'Fixture: a made-up tests command')
    const forkBase = fixture.git('rev-parse', 'HEAD')
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(fixture.checkout, path)), { recursive: true })
      writeFileSync(join(fixture.checkout, path), text)
    }
    fixture.git('add', '.')
    fixture.git('commit', '-qm', 'Fixture: a made-up change')
    fixture.state.workArea = Object.keys(files)
    fixture.state.submission = {
      id: 'synthetic-seal',
      seal: { kind: 'git', hash: 'a'.repeat(64), git: { directory: fixture.checkout, commit: fixture.git('rev-parse', 'HEAD'), forkBase }, records: null, ...(declared === undefined ? {} : { standard: declared }) },
    }
    fixture.state.reading = {
      agent: { id: 'theWorkersId', handle: 'the-worker', startedBy: null },
      ...(checkLog === null ? {} : { theCheck: { execution: { log: checkLog } } }),
    } as never
    const asks: Record<string, any>[] = []
    const verdicts: Record<string, any>[] = []
    const answer = (reply: import('node:http').ServerResponse, status: number, said: unknown) => {
      reply.statusCode = status
      reply.setHeader('content-type', 'application/json')
      reply.end(JSON.stringify(said))
    }
    fixture.state.onRequest = (request, reply) => {
      if (request.method === 'GET' && request.url === '/api/office/gates') {
        const rows = ['standard-one-plugin', 'standard-words', 'standard-tests', 'standard-documents'].map((id) => ({ id, value: '1' }))
        answer(reply, 200, { classes: [{ class: 'process', groups: [{ group: 'standard-changes', rows }] }] })
        return true
      }
      const kept = request.url === `/api/checks/${fixture.run}/standard` ? asks : request.url === `/api/checks/${fixture.run}` && request.method === 'POST' ? verdicts : null
      if (kept === null) return false
      let raw = ''
      request.on('data', (part) => { raw += String(part) })
      request.on('end', () => {
        kept.push(JSON.parse(raw) as Record<string, any>)
        if (kept === asks) answer(reply, door.status, door.said)
        else answer(reply, 201, { verdict: 'released', toTheWorker: 'Synthetic.', toTheStarter: '', group: null })
      })
      return true
    }
    const bin = join(fixture.home, 'bin')
    const runs = join(fixture.home, 'runs-of-the-model')
    mkdirSync(bin)
    mkdirSync(runs)
    const A_RELEASE = { verdict: 'released', check: 'Synthetic: no model ran.', chaptersRead: [], traced: [{ paths: ['made-up-notes.md'], to: 'aRecordMadeUp', how: TRACED_HOW[0], said: 'Synthetic.' }] }
    writeFileSync(
      join(bin, 'claude'),
      [
        `#!${process.execPath}`,
        '// A stand-in for claude, written by a test. It runs no model: it keeps each time it was started and answers a made-up release.',
        "import { readdirSync, writeFileSync } from 'node:fs'",
        'process.stdin.resume()',
        "process.stdin.on('end', () => {",
        `  writeFileSync(${JSON.stringify(runs)} + '/' + readdirSync(${JSON.stringify(runs)}).length, 'ran')`,
        `  process.stdout.write(${JSON.stringify(JSON.stringify({ session_id: 'the-checks-own-session-a-test-made-up', result: JSON.stringify(A_RELEASE) }))})`,
        '})',
      ].join('\n'),
    )
    chmodSync(join(bin, 'claude'), 0o755)
    const check = aMadeUpCheckSession()
    const env = { HOME: fixture.home, PATH: `${bin}:${process.env['PATH'] ?? ''}`, CLAUDE_CODE_OAUTH_TOKEN: A_MADE_UP_TOKEN }
    return {
      fixture,
      forkBase,
      asks,
      verdicts,
      check,
      inspect: (how: boolean | { dry?: boolean }) => fixture.inspect(['--check', check], env, how),
      theTests: () => (existsSync(ranTheTests) ? (JSON.parse(readFileSync(ranTheTests, 'utf8')) as { cwd: string; argv: string[]; token: string | null }) : null),
      theModelRan: () => readdirSync(runs).length,
      assembled: () => fixture.state.writes.filter(({ path }) => path.endsWith('/assembled')).map(({ body }) => body),
    }
  }

  it('runs only the changed test file in its own worktree with no secret, and a release ends the check with no model', async () => {
    const logFolder = join(made, 'check-log-release')
    mkdirSync(logFolder, { recursive: true })
    const checkLog = join(logFolder, 'said.txt')
    const one = await aSealedDocument('tests', { status: 201, said: { says: 'Synthetic: released as a standard change.' } }, {
      files: { 'tests/made-up-thing.test.ts': A_TEST, 'tests/made-up-helper.ts': 'export const madeUp = 1\n' },
      checkLog,
      withFakeVite: true,
    })
    const result = await one.inspect(true)
    expect(result.code, result.err).toBe(0)
    expect(one.asks).toHaveLength(1)
    expect(one.asks[0]).toMatchObject({
      kind: 'tests',
      read: { sealKind: 'git', sealId: 'synthetic-seal', ofItsOwn: true },
      toolRead: { neverStandard: [], cases: [{ path: 'tests/made-up-helper.ts', removed: [] }, { path: 'tests/made-up-thing.test.ts', removed: [] }], words: [] },
      checks: [{ name: 'changed-tests', argv: ['node', 'tools/run-named-tests.mjs', 'tests/made-up-thing.test.ts'], code: 0 }],
    })
    const tests = one.theTests()
    expect(tests?.argv).toEqual(['tests/made-up-thing.test.ts'])
    expect(tests?.cwd).not.toBe(realpathSync(one.fixture.checkout))
    expect(basename(tests?.cwd ?? '')).toBe(basename(one.fixture.pathFor(one.check)))
    expect(tests?.token).toBeNull()
    expect(one.theModelRan()).toBe(0)
    expect(one.assembled()).toEqual([])
    expect(one.verdicts).toEqual([])
    expect(result.out).toContain('is released as a standard change of the kind tests, and no model ran. Synthetic: released as a standard change.')
    const keptName = readdirSync(logFolder).find((name) => name.endsWith('-changed-tests.txt'))!
    expect(result.out).toContain(`Its full output is kept at ${join(logFolder, keptName)}`)
    expect(readFileSync(join(logFolder, keptName), 'utf8')).toContain('The made-up runner ran.')
    expect(existsSync(one.fixture.pathFor(one.check))).toBe(false)
  })

  it('keeps every line a failing standard check wrote after the private worktree is removed', async () => {
    const logFolder = join(made, 'check-log-failure')
    mkdirSync(logFolder, { recursive: true })
    const checkLog = join(logFolder, 'said.txt')
    const lines = Array.from({ length: 40 }, (_, n) => `made-up failing line ${String(n)}`)
    const partLog = `${basename(made)}-part.log`
    const runner = [
      "import { mkdirSync, writeFileSync } from 'node:fs'",
      "mkdirSync(new URL('../.logs/', import.meta.url), { recursive: true })",
      `writeFileSync(new URL(${JSON.stringify(partLog)}, new URL('../.logs/', import.meta.url)), 'made-up early per-part line\\n')`,
      `for (const line of ${JSON.stringify(lines)}) console.log(line)`,
      "console.error('made-up error line')",
      'process.exit(1)',
    ].join('\n') + '\n'
    const one = await aSealedDocument('tests', { status: 409, said: { error: 'changed-tests exited 1' } }, {
      files: { 'tests/made-up-thing.test.ts': A_TEST },
      runner,
      checkLog,
      withFakeVite: true,
    })
    const result = await one.inspect(true)
    expect(result.code, result.err).toBe(0)
    expect(existsSync(one.fixture.pathFor(one.check))).toBe(false)
    const heldName = readdirSync(logFolder).find((name) => name.endsWith('-changed-tests.txt'))!
    const held = readFileSync(join(logFolder, heldName), 'utf8')
    for (const line of lines) expect(held).toContain(line)
    expect(held).toContain('made-up error line')
    expect(held).toContain('# It exited 1.')
    expect(result.out).toContain(`Its full output is kept at ${join(logFolder, heldName)}`)
    expect(result.out).toContain(lines.at(-1)!)
    expect(result.out).not.toContain(lines[0])
    const logsName = readdirSync(logFolder).find((name) => name.endsWith('-changed-tests-logs'))!
    const logsAt = join(logFolder, logsName)
    expect(result.out).toContain(`Its full run logs are kept at ${logsAt}`)
    expect(readFileSync(join(logsAt, partLog), 'utf8')).toContain('made-up early per-part line')
    expect(one.theModelRan()).toBe(1)
  })

  it('keeps two checks\' evidence apart when their logs share one folder', async () => {
    const logFolder = join(made, 'collision-logs')
    mkdirSync(logFolder, { recursive: true })
    const aMarker = (marker: string) => `console.log(${JSON.stringify(`marker ${marker}`)})\n`
    const first = await aSealedDocument('tests', { status: 201, said: { says: 'Synthetic: released as a standard change.' } }, {
      files: { 'tests/made-up-thing.test.ts': A_TEST },
      runner: aMarker('A'),
      checkLog: join(logFolder, 'check-a.log'),
      withFakeVite: true,
    })
    const firstResult = await first.inspect(true)
    expect(firstResult.code, firstResult.err).toBe(0)
    expect(existsSync(first.fixture.pathFor(first.check))).toBe(false)
    await first.fixture.close()
    const second = await aSealedDocument('tests', { status: 201, said: { says: 'Synthetic: released as a standard change.' } }, {
      files: { 'tests/made-up-thing.test.ts': A_TEST },
      runner: aMarker('B'),
      checkLog: join(logFolder, 'check-b.log'),
      withFakeVite: true,
    })
    const secondResult = await second.inspect(true)
    expect(secondResult.code, secondResult.err).toBe(0)
    expect(existsSync(second.fixture.pathFor(second.check))).toBe(false)
    const outputs = readdirSync(logFolder).filter((name) => name.endsWith('changed-tests.txt'))
    expect(outputs).toHaveLength(2)
    const held = outputs.map((name) => readFileSync(join(logFolder, name), 'utf8'))
    expect(held.some((text) => text.includes('marker A'))).toBe(true)
    expect(held.some((text) => text.includes('marker B'))).toBe(true)
  })

  it('fails the check in words when the evidence folder cannot be written', async () => {
    const logFolder = join(made, 'read-only-evidence')
    mkdirSync(logFolder, { recursive: true })
    chmodSync(logFolder, 0o500)
    try {
      const one = await aSealedDocument('tests', { status: 409, said: { error: 'its evidence was not kept' } }, {
        files: { 'tests/made-up-thing.test.ts': A_TEST },
        checkLog: join(logFolder, 'said.txt'),
        withFakeVite: true,
      })
      const result = await one.inspect(true)
      expect(result.code, result.err).toBe(0)
      expect(one.asks[0]?.checks).toMatchObject([{ name: 'changed-tests', code: null }])
      expect(result.out).toContain('evidence could not be kept')
      expect(one.theModelRan()).toBe(1)
    } finally {
      chmodSync(logFolder, 0o700)
    }
  })

  it('builds dist/web before the changed test, inside the same check, and keeps the build output', async () => {
    const logFolder = join(made, 'check-log-build')
    mkdirSync(logFolder, { recursive: true })
    const one = await aSealedDocument('tests', { status: 201, said: { says: 'Synthetic: released as a standard change.' } }, {
      files: { 'tests/made-up-thing.test.ts': A_TEST },
      checkLog: join(logFolder, 'said.txt'),
      withFakeVite: true,
      requiresBuiltPage: true,
    })
    const result = await one.inspect(true)
    expect(result.code, result.err).toBe(0)
    expect(one.asks[0]).toMatchObject({ kind: 'tests', checks: [{ name: 'changed-tests', code: 0 }] })
    const preparedName = readdirSync(logFolder).find((name) => name.endsWith('-changed-tests-prepare.txt'))!
    const prepared = readFileSync(join(logFolder, preparedName), 'utf8')
    expect(prepared).toContain('made-up vite build ran')
    expect(prepared).toContain('# It exited 0.')
    expect(one.theTests()?.argv).toEqual(['tests/made-up-thing.test.ts'])
    expect(one.theModelRan()).toBe(0)
    expect(result.out).toContain('Preparation:')
  })

  it('runs no test command for a documents-only change, says the queue is its proof, and goes the ordinary way', async () => {
    const logFolder = join(made, 'check-log-documents')
    mkdirSync(logFolder, { recursive: true })
    const one = await aSealedDocument('documents', { status: 409, said: { error: 'changed-tests did not run' } }, { checkLog: join(logFolder, 'said.txt') })
    const result = await one.inspect(true)
    expect(result.code, result.err).toBe(0)
    expect(one.asks[0]).toMatchObject({ kind: 'documents', checks: [] })
    expect(one.theTests()).toBeNull()
    expect(result.out).toContain('no changed file is a runnable test file')
    expect(result.out).toContain("merge queue's related run")
    expect(one.theModelRan()).toBe(1)
    expect(readdirSync(logFolder).some((name) => name.endsWith('-changed-tests.txt'))).toBe(false)
  })

  it('tells the door that no model ran, in the read a standard release keeps', async () => {
    const logFolder = join(made, 'check-log-no-model')
    mkdirSync(logFolder, { recursive: true })
    const one = await aSealedDocument('tests', { status: 201, said: { says: 'Synthetic: released as a standard change.' } }, { files: { 'tests/made-up-thing.test.ts': A_TEST }, withFakeVite: true, checkLog: join(logFolder, 'said.txt') })
    const result = await one.inspect(true)
    expect(result.code, result.err).toBe(0)
    expect(one.theModelRan()).toBe(0)
    const says = String(one.asks[0]?.['read']?.['says'] ?? '')
    expect(says).toContain("No model ran: the release came from the change's own checks and its kind.")
    expect(says).not.toContain('model runs')
  })

  it('goes the ordinary way when the door does not release it, and the verdict says why it read the change', async () => {
    const one = await aSealedDocument('documents', { status: 409, said: { error: 'Synthetic: the door keeps it back. Nothing was written.' } })
    const result = await one.inspect(true)
    expect(result.code, result.err).toBe(0)
    expect(one.asks).toHaveLength(1)
    expect(one.theModelRan()).toBe(1)
    const why = 'The release door did not release it as a standard change (HTTP 409): Synthetic: the door keeps it back. Nothing was written. The check goes the ordinary way.'
    expect(one.assembled()[0]?.['read']?.['says']).toContain(why)
    expect(one.verdicts).toHaveLength(1)
    expect(one.verdicts[0]?.['read']?.['says']).toContain(why)
  })

  it('never asks the door for a seal that declares no kind, nor on a dry assembly', async () => {
    const none = await aSealedDocument(undefined, { status: 201, said: { says: 'never asked' } })
    const ordinary = await none.inspect(true)
    expect(ordinary.code, ordinary.err).toBe(0)
    expect(none.asks).toEqual([])
    expect(none.theTests()).toBeNull()
    expect(none.theModelRan()).toBe(1)
    expect(none.assembled()[0]?.['read']?.['says']).not.toMatch(/standard (?:change|kind)/u)
    await f?.close()
    f = null
    const dry = await aSealedDocument('documents', { status: 201, said: { says: 'never asked' } })
    const assembledOnly = await dry.inspect({})
    expect(assembledOnly.code, assembledOnly.err).toBe(0)
    expect(dry.asks).toEqual([])
    expect(dry.theTests()).toBeNull()
    expect(dry.assembled()).toHaveLength(1)
  })
})

describe('one standard check as a child', () => {
  const aChild = (file: string, body: string): string => {
    const at = join(made, file)
    writeFileSync(at, body)
    return at
  }

  it('keeps every line of a failing child, and returns only its bounded end', async () => {
    const keepAt = join(made, 'host-full.txt')
    const lines = Array.from({ length: 40 }, (_, n) => `made-up host line ${String(n)}`)
    const child = aChild('host-failing.mjs', [
      `for (const line of ${JSON.stringify(lines)}) console.log(line)`,
      "console.error('made-up host error line')",
      'process.exit(3)',
    ].join('\n') + '\n')
    const ran = await runAStandardCheckAsAChild({ name: 'changed-tests', argv: [process.execPath, child], limitMs: 5000, cwd: made, keepAt })
    expect(ran.code).toBe(3)
    expect(ran.keptAt).toBe(keepAt)
    expect(theKeptOutputSays(ran)).toBe(` Its full output is kept at ${keepAt}.`)
    expect(ran.said).toContain(lines.at(-1)!)
    expect(ran.said).not.toContain(lines[0])
    const held = readFileSync(keepAt, 'utf8')
    for (const line of lines) expect(held).toContain(line)
    expect(held).toContain('made-up host error line')
    expect(held).toContain('# It exited 3.')
  })

  it('stops the whole group at the clock, and leaves no grandchild writing', async () => {
    const keepAt = join(made, 'host-stopped.txt')
    const beats = join(made, 'host-beats.txt')
    const child = aChild('host-stopping.mjs', [
      "import { spawn } from 'node:child_process'",
      "import { appendFileSync } from 'node:fs'",
      `const grand = spawn(process.execPath, ['-e', ${JSON.stringify(`setInterval(() => require('node:fs').appendFileSync(${JSON.stringify(beats)}, 'g'), 50)`)}], { stdio: 'ignore' })`,
      `appendFileSync(${JSON.stringify(beats)}, 'c')`,
      'setInterval(() => {}, 1000)',
      'void grand',
    ].join('\n') + '\n')
    const ran = await runAStandardCheckAsAChild({ name: 'changed-tests', argv: [process.execPath, child], limitMs: 1500, cwd: made, keepAt })
    expect(ran.code).toBeNull()
    expect(ran.said).toContain('was stopped')
    const held = readFileSync(keepAt, 'utf8')
    expect(held).toContain('was stopped')
    const before = readFileSync(beats, 'utf8')
    expect(before).toContain('c')
    await new Promise((done) => setTimeout(done, 350))
    expect(readFileSync(beats, 'utf8')).toBe(before)
  })

  it('says a write failure honestly and never claims a complete copy', async () => {
    const ran = await runAStandardCheckAsAChild({
      name: 'changed-tests',
      argv: [process.execPath, '-e', "console.log('a made-up line')"],
      limitMs: 5000,
      cwd: made,
      keepAt: '/dev/full',
    })
    expect(ran.complete).toBe(false)
    expect(ran.keptWhy).not.toBeNull()
    expect(theKeptOutputSays(ran)).toContain('Its full output is incomplete at /dev/full')
    expect(theKeptOutputSays(ran)).not.toContain('Its full output is kept at')
  })

  it('keeps one split UTF-8 character whole in the durable stream and the summary', async () => {
    const keepAt = join(made, 'utf8-kept.txt')
    const phases = join(made, 'utf8-phases.txt')
    const child = aChild('utf8.mjs', [
      "import { appendFileSync, readFileSync } from 'node:fs'",
      `const phases = ${JSON.stringify(phases)}`,
      `const keepAt = ${JSON.stringify(keepAt)}`,
      'const head = Buffer.from([0xe2])',
      'const headerLength = readFileSync(keepAt).length',
      "appendFileSync(phases, 'head-written\\n')",
      'process.stdout.write(head)',
      'const started = Date.now()',
      'const waitForTheParent = () => {',
      '  let held = Buffer.alloc(0)',
      '  try { held = readFileSync(keepAt) } catch {}',
      '  if (held.includes(head)) {',
      '    const heldBeyondTheHeader = held.length - headerLength',
      '    if (heldBeyondTheHeader !== 1) { appendFileSync(phases, `parent-held-${String(heldBeyondTheHeader)}-bytes\\n`); process.exit(2) }',
      "    appendFileSync(phases, 'parent-held-one-byte\\n')",
      "    appendFileSync(phases, 'parent-consumed-head\\n')",
      '    process.stdout.write(Buffer.from([0x82, 0xac]))',
      "    process.stdout.write('\\n')",
      "    appendFileSync(phases, 'tail-written\\n')",
      '    process.exit(0)',
      '  }',
      "  if (Date.now() - started > 5000) { appendFileSync(phases, 'barrier-timeout\\n'); process.exit(2) }",
      '  setTimeout(waitForTheParent, 1)',
      '}',
      'waitForTheParent()',
    ].join('\n') + '\n')
    const ran = await runAStandardCheckAsAChild({ name: 'changed-tests', argv: [process.execPath, child], limitMs: 5000, cwd: made, keepAt })
    expect(thePhasesAt(phases)).toEqual(['head-written', 'parent-held-one-byte', 'parent-consumed-head', 'tail-written'])
    expect(ran.code).toBe(0)
    expect(readFileSync(keepAt, 'utf8')).toContain('€')
    expect(ran.said).toContain('€')
  })

  it('kills a child that ignores TERM at the clock, and leaves the whole group gone', async () => {
    const ready = join(made, 'term-ready.txt')
    const grandReady = join(made, 'term-grand-ready.txt')
    const pids = join(made, 'term-pids.json')
    const leader = join(made, 'term-leader.json')
    const phases = join(made, 'term-phases.txt')
    const beats = join(made, 'term-beats.txt')
    const keepAt = join(made, 'term-stopped.txt')
    const grand = [
      "process.on('SIGTERM', () => {})",
      "const fs = require('node:fs')",
      `fs.appendFileSync(${JSON.stringify(phases)}, 'grand-handler-installed\\n')`,
      `fs.appendFileSync(${JSON.stringify(beats)}, 'g')`,
      `fs.writeFileSync(${JSON.stringify(grandReady)}, 'ready')`,
      `setInterval(() => fs.appendFileSync(${JSON.stringify(beats)}, 'g'), 25)`,
    ].join('\n')
    const child = aChild('ignores-term.mjs', [
      "import { spawn } from 'node:child_process'",
      "import { appendFileSync, existsSync, writeFileSync } from 'node:fs'",
      "process.on('SIGTERM', () => {})",
      `appendFileSync(${JSON.stringify(phases)}, 'own-handler-installed\\n')`,
      `writeFileSync(${JSON.stringify(leader)}, JSON.stringify({ child: process.pid, group: process.pid }))`,
      `const grand = spawn(process.execPath, ['-e', ${JSON.stringify(grand)}], { stdio: 'ignore' })`,
      'const started = Date.now()',
      'const waitForTheGrandchild = () => {',
      `  if (existsSync(${JSON.stringify(grandReady)})) {`,
      `    appendFileSync(${JSON.stringify(phases)}, 'grand-ready-seen\\n')`,
      `    writeFileSync(${JSON.stringify(pids)}, JSON.stringify({ child: process.pid, group: process.pid, grand: grand.pid }))`,
      `    appendFileSync(${JSON.stringify(phases)}, 'ready\\n')`,
      `    writeFileSync(${JSON.stringify(ready)}, 'ready')`,
      '    setInterval(() => {}, 1000)',
      '    return',
      '  }',
      `  if (Date.now() - started > 5000) { appendFileSync(${JSON.stringify(phases)}, 'grandchild-timeout\\n'); process.exit(2) }`,
      '  setTimeout(waitForTheGrandchild, 1)',
      '}',
      'waitForTheGrandchild()',
    ].join('\n') + '\n')
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    try {
      const running = runAStandardCheckAsAChild({ name: 'changed-tests', argv: [process.execPath, child], limitMs: 400, cwd: made, keepAt })
      await waitForAFile(ready, 5000)
      const held = aRecordedGroupAt(pids)
      if (held === null) throw new Error('The fixture did not record its own pids.')
      await vi.advanceTimersByTimeAsync(401)
      expect(theProcessIsGone(held.child)).toBe(false)
      expect(theProcessIsGone(held.grand)).toBe(false)
      await vi.advanceTimersByTimeAsync(5001)
      const ran = await running
      expect(ran.code).toBeNull()
      expect(readFileSync(ready, 'utf8')).toBe('ready')
      expect(readFileSync(keepAt, 'utf8')).toContain('was stopped')
      expect(thePhasesAt(phases)).toEqual(['own-handler-installed', 'grand-handler-installed', 'grand-ready-seen', 'ready'])
      const leaderRecord = aRecordedGroupAt(leader)
      expect(leaderRecord?.child).toBe(held.child)
      expect(leaderRecord?.group).toBe(held.group)
      await waitUntilGone(held.child, 5000)
      await waitUntilGone(held.grand, 5000)
      expect(theProcessIsGone(-held.group)).toBe(true)
      expect(readFileSync(beats, 'utf8')).toContain('g')
    } finally {
      vi.useRealTimers()
      const owned = aRecordedGroupAt(leader) ?? aRecordedGroupAt(pids)
      if (owned !== null) {
        try {
          process.kill(-owned.group, 'SIGKILL')
        } catch {
          /* The group is already gone. */
        }
      }
    }
  }, 15_000)

  it('keeps the preparation and the tests inside one limit', () => {
    expect(theTimeLeft(600, 0)).toBe(600)
    expect(theTimeLeft(600, 250)).toBe(350)
    expect(theTimeLeft(600, 650)).toBe(0)
    expect(thePreparationLimit({ limitMs: 600, prepareLimitMs: 300, spentMs: 0 })).toBe(300)
    expect(thePreparationLimit({ limitMs: 600, prepareLimitMs: 300, spentMs: 400 })).toBe(200)
    expect(thePreparationLimit({ limitMs: 600, prepareLimitMs: 300, spentMs: 650 })).toBe(0)
  })

  it('keeps the real q summary\'s omitted early line after the private tree is gone', async () => {
    const cwd = join(made, 'a-check-tree')
    mkdirSync(join(cwd, '.logs'), { recursive: true })
    const lines = Array.from({ length: 40 }, (_, n) => `made-up q line ${String(n)}`)
    const noisy = join(cwd, 'noisy.mjs')
    writeFileSync(noisy, `${lines.map((line) => `console.log(${JSON.stringify(line)})`).join('\n')}\nprocess.exit(1)\n`)
    const keepAt = join(made, 'q-kept.txt')
    const ran = await runAStandardCheckAsAChild({
      name: 'changed-tests',
      argv: [process.execPath, join(process.cwd(), 'tools/q.mjs'), '--tail', '5', process.execPath, noisy],
      limitMs: 10_000,
      cwd,
      keepAt,
    })
    expect(ran.code).toBe(1)
    expect(ran.said).not.toContain(lines[0])
    const logsAt = join(made, 'q-kept-logs')
    const files = readdirSync(logsAt)
    expect(files.length).toBeGreaterThan(0)
    const held = files.map((file) => readFileSync(join(logsAt, file), 'utf8')).join('\n')
    expect(held).toContain(lines[0])
    rmSync(cwd, { recursive: true, force: true })
    expect(readFileSync(join(logsAt, files[0]!), 'utf8')).toContain(lines[0])
    expect(ran.keptLogs.keptAt).toBe(logsAt)
  })

  it('writes a start failure beside the log, and hands the child no secret or office variable', async () => {
    const keepAt = join(made, 'host-start-failure.txt')
    const failed = await runAStandardCheckAsAChild({ name: 'changed-tests', argv: [join(made, 'not-a-program')], limitMs: 1000, cwd: made, keepAt })
    expect(failed.code).toBeNull()
    expect(failed.said).toContain('could not be started')
    expect(readFileSync(keepAt, 'utf8')).toContain('could not be started')

    const child = aChild('host-environment.mjs', "console.log(JSON.stringify({ api: process.env.MOLE_OFFICE_API ?? null, key: process.env.MOLE_AGENT_KEY ?? null, claude: process.env.CLAUDE_CODE_OAUTH_TOKEN ?? null, openai: process.env.OPENAI_API_KEY ?? null }))\n")
    const env = { ...process.env, MOLE_OFFICE_API: 'http://made-up.invalid', MOLE_AGENT_KEY: 'made-up-key', CLAUDE_CODE_OAUTH_TOKEN: 'made-up-token', OPENAI_API_KEY: 'made-up-openai-key' }
    const ran = await runAStandardCheckAsAChild({ name: 'changed-tests', argv: [process.execPath, child], limitMs: 5000, cwd: made, keepAt: null, env })
    expect(ran.keptAt).toBeNull()
    expect(theKeptOutputSays(ran)).toContain('Its full output could not be kept')
    expect(JSON.parse(ran.said)).toEqual({ api: null, key: null, claude: null, openai: null })
  })

  it('keeps the sandbox branch\'s whole output, its clock stop and its start failure beside the log', async () => {
    const logFolder = join(made, 'sandbox-log')
    mkdirSync(logFolder, { recursive: true })
    const view = inspectorViewStandIn()
    const sandboxLines = Array.from({ length: 40 }, (_, n) => `made-up sandbox line ${String(n)}`)
    const launcher = async (asked: any, words: string[], command: any = null) => {
      const started = await view.launcher(asked, words, command)
      const start = JSON.parse(started.stdout)
      writeFileSync(start.out, `${sandboxLines.join('\n')}\n`)
      writeFileSync(start.err, 'made-up sandbox error\n')
      return started
    }
    const runInsideTheView = (sandbox: any, options: any) => runInside(sandbox, { ...options, launcher })
    try {
      const keepAt = join(logFolder, 'standard-changed-tests.txt')
      const ran = await runASandboxStandardCheck({ name: 'changed-tests', argv: ['synthetic-command'], limitMs: 1000, cwd: view.work, sandbox: view.sandbox, keepAt, runInside: runInsideTheView })
      expect(ran.code).toBe(0)
      expect(ran.keptAt).toBe(keepAt)
      const held = readFileSync(keepAt, 'utf8')
      for (const line of sandboxLines) expect(held).toContain(line)
      expect(held).toContain('made-up sandbox error')
      expect(view.calls[0]!.words).not.toContain('--secret')

      view.exit(124)
      const stoppedAt = join(logFolder, 'standard-changed-tests-stopped.txt')
      const stopped = await runASandboxStandardCheck({ name: 'changed-tests', argv: ['synthetic-command'], limitMs: 1000, cwd: view.work, sandbox: view.sandbox, keepAt: stoppedAt, runInside: runInsideTheView })
      expect(stopped.code).toBeNull()
      expect(readFileSync(stoppedAt, 'utf8')).toContain('was stopped')
    } finally {
      view.close()
    }

    const failing = inspectorViewStandIn()
    try {
      const startFailure = join(logFolder, 'standard-changed-tests-start-failure.txt')
      const ran = await runASandboxStandardCheck({
        name: 'changed-tests',
        argv: ['synthetic-command'],
        limitMs: 1000,
        cwd: failing.work,
        sandbox: failing.sandbox,
        keepAt: startFailure,
        runInside: (sandbox: any, options: any) => runInside(sandbox, { ...options, launcher: async () => { throw new Error('made-up start failure') } }),
      })
      expect(ran.code).toBeNull()
      expect(ran.said).toContain('made-up start failure')
      expect(readFileSync(startFailure, 'utf8')).toContain('made-up start failure')
    } finally {
      failing.close()
    }
  })
})

describe('a standard check in the sandbox', () => {
  it('is handed no secret and no login, where a model in the same view is handed both', async () => {
    const view = inspectorViewStandIn({ secrets: { CLAUDE_CODE_OAUTH_TOKEN: 'made-up-claude-token-not-a-real-one' } })
    try {
      const seed = join(view.sandbox.checkDir, 'login-seeds', 'claude.json')
      mkdirSync(dirname(seed), { recursive: true })
      writeFileSync(seed, JSON.stringify({ claudeAiOauth: { accessToken: 'made-up-claude-login-not-a-real-one', expiresAt: 4_102_444_800_000 } }), { mode: 0o600 })
      Object.assign(view.sandbox, { loginSeeds: [{ host: seed, container: '/login/claude.json', target: '.claude/.credentials.json' }] })
      const run = (label: string) => runInside(view.sandbox, { label, cwd: view.work, argv: ['synthetic-command'], limitMs: 1000, launcher: view.launcher })
      const secrets = (n: number) => view.calls[n]!.words.filter((_, i, words) => words[i - 1] === '--secret')
      expect((await run('claude-code')).code).toBe(0)
      expect((await run(`${A_STANDARD_CHECK}changed-tests`)).code).toBe(0)
      expect(secrets(0)).toEqual(['CLAUDE_CODE_OAUTH_TOKEN'])
      expect(view.calls[0]!.spec.loginSeeds).toHaveLength(1)
      expect(secrets(1)).toEqual([])
      expect(view.calls[1]!.spec).not.toHaveProperty('loginSeeds')
    } finally {
      view.close()
    }
  })
})
