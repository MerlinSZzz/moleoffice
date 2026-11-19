// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A NAMED RUN SENDS EACH FILE'S RESULT, ITS SECONDS, THE FILE'S HASH AND THE TREE IT RAN IN.
 *
 * The contract is the wave 13n brief: beside the use line's tool and said, POST /api/toolset/uses takes `files`, one
 * item for each named test file in the order it was named (passed, failed or no result; seconds; the first 16 hex
 * characters of the file's SHA-256), and `tree` (the HEAD commit and a hash of the uncommitted change, or null when
 * the folder is not a git checkout or the tree changed while the tests ran). The office's side is another worker's;
 * this file proves the sending side against a stand-in office and a stand-in vitest, as
 * tests/named-tests-run-only-what-is-named.test.ts does for the line.
 *
 * WHAT IS PROVED
 *   1. Three named files, with one passed, one failed and one left out of the report: the office hears passed,
 *      failed and no result, the right seconds (rounded to the millisecond, null for the one with no item), and each
 *      file's hash from the bytes the case wrote. The said line is the one the tool wrote before this round.
 *   2. A clean repository: tree.commit is its HEAD and tree.change is none.
 *   3. A tracked file changed gives a 16-character change; the same change gives the same hash, a different change a
 *      different one, an added untracked file changes it, and an ignored file does not.
 *   4. A folder that is not a git checkout gives {commit: null, change: null}.
 *   5. A changed tree during the run gives nulls, and the tool prints its sentence.
 *   6. A named test file changed during the run gives that file's hash as null, and leaves the others' hashes alone.
 *   7. An office that answers 400 naming files and tree as unrecognized keys gets a second send of {tool, said} alone;
 *      the words say the results were not stored; the exit code is still vitest's.
 *   8. Any other 400 gets one send, and the office's own words are printed.
 *   9. --print sends nothing.
 *  10. The tool's own report is under .logs, and a clean repository still reads none afterwards.
 *  11. A 201 says how many results the office stored, and says so plainly when its reply holds no number.
 *  12. The stand-in office itself: a request with no body, or with a body that is not JSON, is answered 400 and heard
 *      with its method, its address and the text it was sent, and nothing is thrown.
 *
 * THE TEST-BATCHES SEAT. The tool also asks for a seat before its first file and gives it back after its last
 * (tools/test-batch-seat.mjs). The stand-in office grants it and takes it back, and does not count those two requests
 * among what it heard: what it heard is what the use door is sent. The seat is proved in
 * tests/the-test-tool-takes-a-test-batch-seat.test.ts.
 *
 * Each case that needs git makes its own repository in its own temporary folder, with the identity on the commit
 * command, and never touches a global git configuration. Every key and address here is made up; nothing reaches an
 * office.
 */
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const REPO = join(import.meta.dirname, '..')
const TOOL = join(REPO, 'tools', 'run-named-tests.mjs')
const OFFICE_VARIABLES = ['MOLE_OFFICE_API', 'MOLE_OFFICE_API_ROOT', 'MOLE_OFFICE_WORKSPACE', 'MOLE_OFFICE_SESSION', 'MOLE_OFFICE_AGENT']
const THE_KEY = 'mok_a-made-up-key-for-a-named-run-0001'
const THE_RUN = 'the-calling-run'
const THE_SENTENCE = 'run-named-tests: the tree changed while the tests ran, so its commit and its change are sent as not known.'

/** The body of a use, as the tool sends it. */
interface Body {
  tool?: string
  said?: string
  files?: unknown[]
  tree?: unknown
}

/** One request the stand-in office heard: the text it was sent, and that text read as JSON, or null when it is not JSON. */
interface Heard {
  url: string
  session: unknown
  text: string
  body: Body | null
}

let root = ''
let office: Server
let api = ''
let heard: Heard[] = []
const THE_SEAT = 'seat-of-the-named-run'
const THE_ROW = 'row-of-the-named-run'

/** The stand-in's answer to the test-batches seat's two doors, or null for any other request. */
function theSeatsAnswer(url: string): unknown {
  if (url === 'POST /api/slots/acquire') return { slot: { id: THE_SEAT, state: 'granted', seat: 1, position: null }, asked: 'new', handedOn: [], says: 'Granted.' }
  if (url === `POST /api/slots/${THE_SEAT}/release`) return { released: true, id: THE_SEAT, says: 'Given back.' }
  return null
}

/**
 * The stand-in's answer to the tool's own process row, or null for any other request. The row is not what this test
 * reads: it is proved in the-test-tool-registers-its-own-background-process, so it is answered and not counted.
 */
function theOwnRowAnswer(url: string): unknown {
  if (url === 'POST /api/resources') return { resource: { id: THE_ROW, type: 'process' } }
  if (url === `POST /api/resources/${THE_ROW}/release`) return { resource: { id: THE_ROW } }
  return null
}
/** What the stand-in office answers one request with. Set by the cases that need a refusal. */
let answer: (body: Body) => { status: number; body: unknown }

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'a-named-run-'))
  mkdirSync(join(root, 'tests'))
  heard = []
  answer = (body) => ({ status: 201, body: { run: THE_RUN, ...(Array.isArray(body.files) ? { files: body.files.length } : {}) } })
  office = createServer((req, res) => {
    let text = ''
    req.on('data', (chunk) => (text += String(chunk)))
    req.on('end', () => {
      // A BODY THAT IS NOT JSON IS HEARD AND ANSWERED 400, NOT THROWN (item 2v of wave 13n). In a whole-suite run a request
      // with no body reached this stand-in, and JSON.parse threw in this listener. The run then had an uncaught error that
      // did not say which request it was. The request was never answered either, and office.close() in afterEach waits
      // for every request still open. The tool sends no such request: it sends only POSTs with a JSON body. A request cut
      // before its body ends never comes here, because Node ends it with 'aborted' and not 'end'.
      let body: Body | null = null
      try {
        body = JSON.parse(text) as Body | null
      } catch {
        // Heard below with body null, and answered 400.
      }
      const seat = theSeatsAnswer(`${req.method ?? ''} ${req.url ?? ''}`)
      if (seat !== null) {
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify(seat))
        return
      }
      const row = theOwnRowAnswer(`${req.method ?? ''} ${req.url ?? ''}`)
      if (row !== null) {
        // THE LEDGER'S OWN DOOR ANSWERS 201 with the row it wrote. The tool takes only that; a 200 means no row.
        res.statusCode = 201
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify(row))
        return
      }
      heard.push({ url: `${req.method ?? ''} ${req.url ?? ''}`, session: req.headers['x-mole-office-session'], text, body })
      const answered = body === null
        ? { status: 400, body: { error: `The stand-in office could not read the body ${JSON.stringify(text.slice(0, 200))} as JSON.` } }
        : answer(body)
      res.setHeader('content-type', 'application/json')
      res.statusCode = answered.status
      res.end(JSON.stringify(answered.body))
    })
  })
  await new Promise<void>((ready) => office.listen(0, '127.0.0.1', ready))
  api = `http://127.0.0.1:${String((office.address() as AddressInfo).port)}`
})

afterEach(async () => {
  await new Promise<void>((closed) => office.close(() => closed()))
  rmSync(root, { recursive: true, force: true })
})

/** Writes a file under the case's folder, making its folders, and gives its absolute path. */
function put(path: string, text = "test('x', () => {})\n"): string {
  const full = join(root, path)
  mkdirSync(join(full, '..'), { recursive: true })
  writeFileSync(full, text)
  return full
}

/** The first 16 lowercase hex characters of a file's SHA-256, as the contract asks the tool to send them. */
function hashOf(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 16)
}

/** The tool as a child, answered by the stand-in office, with the four office variables and a made-up key. */
function runTool(words: string[]): Promise<{ code: number | null; out: string }> {
  const env: NodeJS.ProcessEnv = { ...process.env }
  for (const name of [...OFFICE_VARIABLES, 'MOLE_AGENT_KEY', 'MOLE_OFFICE_TOOL_CONFIGURATION']) delete env[name]
  Object.assign(env, {
    MOLE_OFFICE_API: api,
    MOLE_OFFICE_SESSION: THE_RUN,
    MOLE_OFFICE_WORKSPACE: 'default',
    MOLE_OFFICE_AGENT: 'named-tests-tester',
    MOLE_AGENT_KEY: THE_KEY,
  })
  return new Promise((done) => {
    const child = spawn(process.execPath, [TOOL, ...words], { cwd: root, env })
    let out = ''
    child.stdout.on('data', (chunk) => (out += String(chunk)))
    child.stderr.on('data', (chunk) => (out += String(chunk)))
    child.on('close', (code) => done({ code, out }))
  })
}

/** A stand-in vitest: it runs `before`, writes the report items given, and exits 3 so the exit code can be told. */
function standIn(items: unknown[], before = ''): string {
  return put(
    'stand-in-vitest.mjs',
    `import { appendFileSync, writeFileSync } from 'node:fs'
const out = process.argv.find((word) => word.startsWith('--outputFile.json='))
${before}
writeFileSync(out.slice('--outputFile.json='.length), JSON.stringify({ testResults: ${JSON.stringify(items)} }))
process.exit(3)
`,
  )
}

/** The one request the office was sent, and its body. A failure names each request heard, by method and address. */
function theBody(): Body {
  expect(heard.map((one) => one.url), 'the office must hear exactly one request').toHaveLength(1)
  const body = heard[0]!.body
  expect(body, `the office must be sent JSON, and it was sent ${JSON.stringify(heard[0]!.text)}`).not.toBeNull()
  return body!
}

/** Runs git in the case's repository with no shell, and gives its trimmed output; fails the case when git fails. */
function git(args: string[]): string {
  const ran = spawnSyncGit(args)
  expect(ran.status, `git ${args.join(' ')} said: ${ran.stderr}`).toBe(0)
  return ran.stdout.trim()
}

function spawnSyncGit(args: string[]): { status: number | null; stdout: string; stderr: string } {
  return spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' })
}

/** A repository of the case's own, with a .gitignore, a tracked file and one committed test file. */
function aRepository(): { one: string; head: string } {
  git(['init', '--quiet'])
  writeFileSync(join(root, '.gitignore'), '.logs\nignored.txt\nstand-in-vitest.mjs\n')
  writeFileSync(join(root, 'tracked.txt'), 'one\n')
  const one = put('tests/one.test.ts')
  git(['add', '.'])
  git(['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'the first commit'])
  return { one, head: git(['rev-parse', '--verify', 'HEAD^{commit}']) }
}

describe('a named run sends each file\'s result, seconds and hash, and the tree it ran in', () => {
  it('sends passed, failed and no result, the seconds, and each named file\'s hash, in the order they were named', async () => {
    const one = put('tests/one.test.ts')
    const two = put('tests/two.test.ts')
    const three = put('tests/three.test.ts')
    const vitest = standIn([
      { name: one, status: 'passed', startTime: 1000, endTime: 2234.567 },
      { name: two, status: 'failed', startTime: 5000, endTime: 6500 },
    ])
    const run = await runTool(['--root', root, '--vitest', vitest, 'one', 'two', 'three'])
    const body = theBody()
    expect(body.tool).toBe('named-tests')
    expect(body.said).toBe('named 3 files (one, two, three); 2 ran, not the files named (0 added, 1 missing); vitest exited 3')
    expect(body.files).toEqual([
      { file: 'tests/one.test.ts', result: 'passed', seconds: 1.235, testFileHash: hashOf(one) },
      { file: 'tests/two.test.ts', result: 'failed', seconds: 1.5, testFileHash: hashOf(two) },
      { file: 'tests/three.test.ts', result: 'no result', seconds: null, testFileHash: hashOf(three) },
    ])
    expect(body.tree).toEqual({ commit: null, change: null })
    expect(run.code).toBe(3)
  })

  it('sends the HEAD commit and none for a clean repository', async () => {
    const { one, head } = aRepository()
    const vitest = standIn([{ name: one, status: 'passed' }])
    const run = await runTool(['--root', root, '--vitest', vitest, 'tests/one.test.ts'])
    expect(run.code, run.out).toBe(3)
    expect(theBody().tree).toEqual({ commit: head, change: 'none' })
  })

  it('hashes a tracked change, the same change the same way, and leaves an ignored file out', async () => {
    const { one } = aRepository()
    const vitest = standIn([{ name: one, status: 'passed' }])
    const change = async () => {
      const run = await runTool(['--root', root, '--vitest', vitest, 'tests/one.test.ts'])
      expect(run.code, run.out).toBe(3)
      const tree = theBody().tree as { commit: string | null; change: string | null }
      heard.length = 0
      return tree
    }
    writeFileSync(join(root, 'tracked.txt'), 'two\n')
    const first = await change()
    expect(first.change).toMatch(/^[0-9a-f]{16}$/)
    const again = await change()
    expect(again.change).toBe(first.change)
    writeFileSync(join(root, 'tracked.txt'), 'three\n')
    const different = await change()
    expect(different.change).toMatch(/^[0-9a-f]{16}$/)
    expect(different.change).not.toBe(first.change)
    writeFileSync(join(root, 'untracked.txt'), 'an untracked file\n')
    const untracked = await change()
    expect(untracked.change).not.toBe(different.change)
    rmSync(join(root, 'untracked.txt'))
    writeFileSync(join(root, 'ignored.txt'), 'an ignored file\n')
    const ignored = await change()
    expect(ignored.change).toBe(different.change)
  })

  it('sends nulls for the tree when the folder is not a git checkout', async () => {
    const one = put('tests/one.test.ts')
    const vitest = standIn([{ name: one, status: 'passed' }])
    const run = await runTool(['--root', root, '--vitest', vitest, 'tests/one.test.ts'])
    expect(run.code, run.out).toBe(3)
    expect(theBody().tree).toEqual({ commit: null, change: null })
  })

  it('sends nulls, and says the tree changed, when a tracked file changes during the run', async () => {
    const { one } = aRepository()
    const vitest = standIn([{ name: one, status: 'passed' }], `appendFileSync(${JSON.stringify(join(root, 'tracked.txt'))}, 'changed while the tests ran\\n')`)
    const run = await runTool(['--root', root, '--vitest', vitest, 'tests/one.test.ts'])
    expect(theBody().tree).toEqual({ commit: null, change: null })
    expect(run.out).toContain(THE_SENTENCE)
  })

  it('sends a null hash for a named test file changed during the run, and keeps the others', async () => {
    git(['init', '--quiet'])
    writeFileSync(join(root, '.gitignore'), '.logs\nstand-in-vitest.mjs\n')
    const one = put('tests/one.test.ts')
    const two = put('tests/two.test.ts')
    git(['add', '.'])
    git(['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'the first commit'])
    const vitest = standIn(
      [{ name: one, status: 'passed' }, { name: two, status: 'passed' }],
      `appendFileSync(${JSON.stringify(one)}, '// changed while the tests ran\\n')`,
    )
    const run = await runTool(['--root', root, '--vitest', vitest, 'tests/one.test.ts', 'tests/two.test.ts'])
    expect(run.code, run.out).toBe(3)
    const body = theBody()
    expect(body.files).toEqual([
      { file: 'tests/one.test.ts', result: 'passed', seconds: null, testFileHash: null },
      { file: 'tests/two.test.ts', result: 'passed', seconds: null, testFileHash: hashOf(two) },
    ])
  })

  it('sends {tool, said} again when the office does not take files and tree, and says the results were not stored', async () => {
    const one = put('tests/one.test.ts')
    answer = (body) => (body.files === undefined
      ? { status: 201, body: { run: THE_RUN } }
      : { status: 400, body: { error: 'The use Unrecognized keys: "files", "tree"' } })
    const vitest = standIn([{ name: one, status: 'passed' }])
    const run = await runTool(['--root', root, '--vitest', vitest, 'tests/one.test.ts'])
    expect(run.code, run.out).toBe(3)
    expect(heard).toHaveLength(2)
    expect(heard[1]!.body).toEqual({ tool: 'named-tests', said: heard[0]!.body?.said })
    expect(run.out).toContain(`The office at ${api} does not take test file results yet`)
    expect(run.out).toContain('The use Unrecognized keys: "files", "tree"')
    expect(run.out).toContain('1 test file result was not stored')
  })

  it('sends once, and prints the office\'s words, for any other 400', async () => {
    const one = put('tests/one.test.ts')
    answer = () => ({ status: 400, body: { error: 'The use said is longer than 300 characters.' } })
    const vitest = standIn([{ name: one, status: 'passed' }])
    const run = await runTool(['--root', root, '--vitest', vitest, 'tests/one.test.ts'])
    expect(run.code, run.out).toBe(3)
    expect(heard).toHaveLength(1)
    expect(run.out).toContain('The use said is longer than 300 characters.')
  })

  it('sends nothing with --print', async () => {
    put('tests/one.test.ts')
    const run = await runTool(['--print', '--root', root, 'tests/one.test.ts'])
    expect(run.code, run.out).toBe(0)
    expect(heard).toEqual([])
  })

  it('writes its report under .logs, and a clean repository still reads none', async () => {
    const { one, head } = aRepository()
    const vitest = standIn([{ name: one, status: 'passed' }])
    const run = await runTool(['--root', root, '--vitest', vitest, 'tests/one.test.ts'])
    expect(run.code, run.out).toBe(3)
    expect(existsSync(join(root, '.logs'))).toBe(true)
    expect(readdirSync(join(root, '.logs')).filter((name) => /^named-tests-.*\.json$/.test(name)).length).toBeGreaterThan(0)
    expect(theBody().tree).toEqual({ commit: head, change: 'none' })
  })

  it('says how many results the office stored, or that its reply held no number', async () => {
    const one = put('tests/one.test.ts')
    const two = put('tests/two.test.ts')
    const vitest = standIn([{ name: one, status: 'passed' }, { name: two, status: 'failed' }])
    answer = () => ({ status: 201, body: { run: THE_RUN, files: 2 } })
    const stored = await runTool(['--root', root, '--vitest', vitest, 'one', 'two'])
    expect(stored.out).toContain(`The use was written on the run ${THE_RUN}, with 2 test file results.`)
    heard.length = 0
    answer = () => ({ status: 201, body: { run: THE_RUN } })
    const silent = await runTool(['--root', root, '--vitest', vitest, 'one', 'two'])
    expect(silent.out).toContain(`The use was written on the run ${THE_RUN}, but the office did not say whether it stored the 2 test file results.`)
    // One file is one result, in both sentences.
    heard.length = 0
    answer = () => ({ status: 201, body: { run: THE_RUN, files: 1 } })
    const storedOne = await runTool(['--root', root, '--vitest', vitest, 'one'])
    expect(storedOne.out).toContain(`The use was written on the run ${THE_RUN}, with 1 test file result.`)
    heard.length = 0
    answer = () => ({ status: 201, body: { run: THE_RUN } })
    const silentOne = await runTool(['--root', root, '--vitest', vitest, 'one'])
    expect(silentOne.out).toContain(`The use was written on the run ${THE_RUN}, but the office did not say whether it stored the 1 test file result.`)
  })

  it('answers a request with no body, or a body that is not JSON, with a 400, and hears it', async () => {
    // Each ask gives up after ten seconds, so a stand-in that never answers fails this case inside its thirty.
    const asked = await fetch(`${api}/api/toolset/uses`, { signal: AbortSignal.timeout(10_000) })
    expect(asked.status).toBe(400)
    const cut = await fetch(`${api}/api/toolset/uses`, { method: 'POST', body: '{"tool":', signal: AbortSignal.timeout(10_000) })
    expect(cut.status).toBe(400)
    expect(heard.map(({ url, text, body }) => ({ url, text, body }))).toEqual([
      { url: 'GET /api/toolset/uses', text: '', body: null },
      { url: 'POST /api/toolset/uses', text: '{"tool":', body: null },
    ])
  })
})
