// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The real removal tool asks a stand-in office before removing a real temporary worktree. */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, expect, it } from 'vitest'

const tool = fileURLToPath(new URL('../tools/remove-a-worktree.mjs', import.meta.url))
let root: string
let repository: string
let tree: string
let env: NodeJS.ProcessEnv
let office: Server
let api: string
let status: number
let body: unknown
let requests: { url: string; headers: IncomingHttpHeaders }[]

function git(...args: string[]) {
  const result = spawnSync('git', args, { env, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(result.stderr)
  return result.stdout
}

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'worktree-office-test-'))
  const home = join(root, 'home')
  mkdirSync(home)
  env = { ...process.env, HOME: home, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_AUTHOR_NAME: 'Test builder', GIT_AUTHOR_EMAIL: 'test@example.invalid',
    GIT_COMMITTER_NAME: 'Test builder', GIT_COMMITTER_EMAIL: 'test@example.invalid',
    MOLE_OFFICE_AGENT: 'test-worktree-remover', MOLE_OFFICE_SESSION: 'test-removal-run',
    MOLE_OFFICE_WORKSPACE: 'test-project' }
  for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'MOLE_OFFICE_PORT', 'MOLE_AGENT_KEY', 'MOLE_OFFICE_TOOL_CONFIGURATION']) delete env[key]
  // A MADE-UP KEY, because the tool asks the office only with one (wave 13s round 118). The stand-in office does not read it.
  // With the tool refusing every run that gives no --answer, key or not, 15 of these 19 cases went red.
  env.MOLE_AGENT_KEY = 'made-up-test-key'
  repository = join(root, 'repository')
  tree = join(root, 'tree with spaces')
  git('init', repository)
  git('-C', repository, 'commit', '--allow-empty', '-m', 'Test root')
  git('-C', repository, 'worktree', 'add', '--detach', tree)
  requests = []
  status = 200
  body = answer([])
  office = createServer((req, reply) => {
    req.resume()
    requests.push({ url: req.url ?? '', headers: req.headers })
    reply.writeHead(status, { 'content-type': 'application/json' })
    reply.end(typeof body === 'string' ? body : JSON.stringify(body))
  })
  await new Promise<void>((done) => office.listen(0, '127.0.0.1', done))
  api = `http://127.0.0.1:${String((office.address() as AddressInfo).port)}`
})

afterEach(async () => {
  await new Promise<void>((done) => office.close(() => done()))
  rmSync(root, { recursive: true, force: true })
})

function answer(records: unknown[]) {
  return { folder: tree, records, hiddenCount: 0, scope: 'Live records in this project, current words only; unreadable messages, deleted records and older revisions are left out.',
    says: records.length === 0 ? `No record names files inside ${tree}.` : `1 record names files inside ${tree}.` }
}

/**
 * The door's answer since round 115, compared with the worktree's HEAD, with the class of each listed record in `names`.
 * The tool removes a worktree that records name only on such an answer, and only while a branch or keep ref holds HEAD.
 */
function comparedAnswer(records: Record<string, unknown>[]) {
  return { ...answer(records), comparedWith: git('-C', tree, 'rev-parse', 'HEAD').trim(), notComparedBecause: null,
    hiddenCiters: { notCompared: 0, anotherPath: 0, aPathNotThere: 0, trackedFilesOnly: 0, theFolderOnly: 0 } }
}

function heldRecord() {
  return { id: 'test-report-id', kind: 'report', title: 'Test evidence to keep',
    paths: [{ where: 'data.blocks[#source].path', path: join(tree, 'source.ts') }] }
}

function remove(args: string[] = [], address = api, path = tree): Promise<{ code: number | null; output: string }> {
  return new Promise((done, bad) => {
    const child = spawn(process.execPath, [tool, path, ...args], {
      cwd: root, env: { ...env, MOLE_OFFICE_API: address, GIT_TRACE: join(root, 'git-trace.log') },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    child.stdout.on('data', (bytes) => { output += String(bytes) })
    child.stderr.on('data', (bytes) => { output += String(bytes) })
    child.on('error', bad)
    child.on('close', (code) => done({ code, output }))
  })
}

it('keeps a named worktree, exits 2 and lists the record and its paths', async () => {
  body = answer([heldRecord()])
  const out = await remove()
  expect(out.code, out.output).toBe(2)
  expect(existsSync(tree)).toBe(true)
  for (const word of ['test-report-id', 'report', 'Test evidence to keep', 'data.blocks[#source].path', join(tree, 'source.ts'), 'Nothing was removed']) expect(out.output).toContain(word)
  // One sentence counts every record that names the folder: the ones the caller can read and the ones it may not.
  expect(out.output).toContain(`Nothing was removed: 1 record names files inside ${tree}, 1 you can read and 0 you may not.`)
  expect(requests).toHaveLength(1)
  const asked = new URL(requests[0]!.url, api)
  expect(asked.pathname).toBe('/api/report-files/named-inside')
  expect(asked.searchParams.get('folder')).toBe(tree)
  expect(requests[0]!.headers).toMatchObject({ 'x-mole-office-workspace': 'test-project',
    'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'test-worktree-remover' })
})

it('removes a worktree no record names, resolving the path before asking', async () => {
  const alias = join(root, 'alias')
  symlinkSync(tree, alias)
  const out = await remove([], api, alias)
  expect(out.code, out.output).toBe(0)
  expect(existsSync(tree)).toBe(false)
  expect(git('-C', repository, 'worktree', 'list', '--porcelain')).not.toContain(tree)
  expect(new URL(requests[0]!.url, api).searchParams.get('folder')).toBe(tree)
  expect(out.output).toContain(`Removed worktree ${tree}`)
})

// A REMOVAL LEAVES A COMMIT ON NO REF WHETHER OR NOT A RECORD NAMES THE FOLDER (wave 13s round 116, qVdARm06Ryrk).
// So a worktree no record names is kept, with --even-so too, in the words a named one gets, until a branch, a ref under
// refs/keep/ or main holds its HEAD. A tag does not hold it.
it('keeps a worktree no record names whose HEAD no branch or keep ref holds, with --even-so too, in the words a named one gets', async () => {
  writeFileSync(join(tree, 'later.txt'), 'Test work committed on no branch.\n')
  git('-C', tree, 'add', '--', 'later.txt')
  git('-C', tree, 'commit', '-q', '-m', 'Test commit on no branch')
  const later = git('-C', tree, 'rev-parse', 'HEAD').trim()
  for (const args of [[], ['--even-so', 'A because answers for records, never for a commit on no ref.']]) {
    const out = await remove(args)
    expect(out.code, out.output).toBe(1)
    expect(out.output).toContain(`Its HEAD ${later.slice(0, 12)} is on no branch, keep ref or main; put a branch on it first.\nNothing was removed.`)
    expect(out.output).not.toContain('Removing even so')
    expect(existsSync(join(tree, 'later.txt'))).toBe(true)
    expect(readFileSync(join(root, 'git-trace.log'), 'utf8')).not.toContain('worktree remove')
  }
  git('-C', repository, 'tag', 'test-tag', later)
  const tagged = await remove()
  expect(tagged.code, tagged.output).toBe(1)
  expect(tagged.output).toContain('is on no branch, keep ref or main')
  expect(existsSync(tree)).toBe(true)
  git('-C', repository, 'update-ref', 'refs/keep/test-later', later)
  const held = await remove()
  expect(held.code, held.output).toBe(0)
  expect(existsSync(tree)).toBe(false)
  expect(held.output).toContain(`Removed worktree ${tree}`)
  expect(git('-C', repository, 'rev-parse', 'refs/keep/test-later').trim()).toBe(later)
})

// The record names source.ts, which is not there, and the branch the repository began with holds HEAD.
it('removes with --even-so and prints the because and the same record list', async () => {
  body = comparedAnswer([{ ...heldRecord(), names: 'aPathNotThere' }])
  const out = await remove(['--even-so', 'The evidence has been copied into the report.'])
  expect(out.code, out.output).toBe(0)
  expect(existsSync(tree)).toBe(false)
  for (const word of ['The evidence has been copied into the report.', 'test-report-id', 'report', 'Test evidence to keep', 'data.blocks[#source].path', join(tree, 'source.ts')]) expect(out.output).toContain(word)
})

it('keeps the worktree when the office is closed, fails, or gives a different answer', async () => {
  const closed = createServer()
  await new Promise<void>((done) => closed.listen(0, '127.0.0.1', done))
  const nobody = `http://127.0.0.1:${String((closed.address() as AddressInfo).port)}`
  await new Promise<void>((done) => closed.close(() => done()))
  const absent = await remove(['--even-so', 'A failed read is never permission.'], nobody)
  expect(absent.code, absent.output).toBe(1)
  expect(absent.output).toContain(nobody)
  expect(existsSync(tree)).toBe(true)
  for (const [code, reply] of [
    [500, { error: 'Test office failed' }], [200, '<html>Not the door</html>'],
    [200, { records: [], says: 'Not the door shape' }],
    [200, { ...answer([]), folder: join(root, 'another-tree') }],
    [200, answer([{ ...heldRecord(), paths: [] }])],
  ] as const) {
    status = code
    body = reply
    const out = await remove(['--even-so', 'A failed read is never permission.'])
    expect(out.code, out.output).toBe(1)
    expect(out.output).toContain(api)
    expect(out.output).toContain(String(code))
    expect(out.output).toContain('Nothing was removed')
    expect(existsSync(tree)).toBe(true)
  }
})

it('refuses a dirty worktree from its own reading, and runs no status and no removal', async () => {
  writeFileSync(join(tree, 'untracked.txt'), 'Keep this work.')
  const out = await remove()
  expect(out.code, out.output).toBe(1)
  expect(out.output).toContain('contains modified or untracked files')
  expect(out.output).toContain('?? untracked.txt')
  expect(existsSync(tree)).toBe(true)
  expect(readFileSync(join(tree, 'untracked.txt'), 'utf8')).toBe('Keep this work.')
  const trace = readFileSync(join(root, 'git-trace.log'), 'utf8')
  expect(trace).toContain('ls-files')
  expect(trace).not.toContain('worktree remove')
  expect(trace).not.toMatch(/ status\b/)
})

/**
 * Commit in the worktree files git converts on checkout: `*.bin` by a filter no program is configured for, `*.txt` by eol=crlf.
 * A branch holds the new commit, so the converted files, and not a commit on no ref, decide whether the worktree goes.
 */
function commitConvertedFiles(names: string[]) {
  writeFileSync(join(tree, '.gitattributes'), '*.bin filter=lfs\n*.txt eol=crlf\n')
  for (const name of names) writeFileSync(join(tree, name), `Committed bytes of ${name}\n`)
  git('-C', tree, 'add', '--', '.gitattributes', ...names)
  git('-C', tree, 'commit', '-q', '-m', 'Test converted files')
  git('-C', tree, 'branch', 'test-converted-files')
}

// A FILE GIT CONVERTS ON CHECKOUT, HOLDING OTHER BYTES THAN ITS COMMIT, KEEPS THE WORKTREE. Only running the
// conversion could tell whether those bytes are work, and a removal would delete them.
it('keeps a worktree whose converted files hold other bytes, names each, and runs no status and no removal', async () => {
  commitConvertedFiles(['data.bin', 'notes.txt'])
  writeFileSync(join(tree, 'data.bin'), 'Uncommitted work.\n')
  writeFileSync(join(tree, 'notes.txt'), 'Uncommitted notes.\r\n')
  const out = await remove()
  expect(out.code, out.output).toBe(1)
  expect(existsSync(tree)).toBe(true)
  expect(readFileSync(join(tree, 'data.bin'), 'utf8')).toBe('Uncommitted work.\n')
  expect(out.output).toContain(`2 files in ${tree} could not be compared with its commit`)
  expect(out.output).toContain('\ndata.bin\nnotes.txt\nNothing was removed.')
  expect(out.output).not.toContain('contains modified or untracked files')
  const trace = readFileSync(join(root, 'git-trace.log'), 'utf8')
  expect(trace).not.toContain('worktree remove')
  expect(trace).not.toMatch(/ status\b/)
})

it('keeps such a worktree with --even-so too, which answers for records and never for work', async () => {
  commitConvertedFiles(['data.bin'])
  writeFileSync(join(tree, 'data.bin'), 'Uncommitted work.\n')
  writeFileSync(join(tree, 'untracked.txt'), 'Keep this work.')
  // The record names a path that is not there, so the records let it go and the work keeps it.
  body = comparedAnswer([{ ...heldRecord(), names: 'aPathNotThere' }])
  const out = await remove(['--even-so', 'The evidence has been copied into the report.'])
  expect(out.code, out.output).toBe(1)
  expect(existsSync(tree)).toBe(true)
  expect(out.output).toContain('contains modified or untracked files')
  expect(out.output).toContain('?? untracked.txt')
  expect(out.output).toContain(`1 file in ${tree} could not be compared with its commit`)
  expect(out.output).toContain('\ndata.bin\nNothing was removed.')
})

it('names at most twenty files it could not compare, then how many more', async () => {
  const names = Array.from({ length: 22 }, (_, at) => `file-${String(at).padStart(2, '0')}.bin`)
  commitConvertedFiles(names)
  for (const name of names) writeFileSync(join(tree, name), 'Uncommitted work.\n')
  const out = await remove()
  expect(out.code, out.output).toBe(1)
  expect(existsSync(tree)).toBe(true)
  expect(out.output).toContain(`22 files in ${tree} could not be compared with its commit`)
  expect(out.output).toContain('\nfile-00.bin\n')
  expect(out.output).toContain('\nfile-19.bin\nand 2 more.\nNothing was removed.')
  expect(out.output).not.toContain('file-20.bin')
})

it('removes a worktree whose converted files hold their committed bytes, as before', async () => {
  commitConvertedFiles(['data.bin', 'notes.txt'])
  const out = await remove()
  expect(out.code, out.output).toBe(0)
  expect(existsSync(tree)).toBe(false)
  expect(out.output).toContain(`Removed worktree ${tree}`)
})

it('refuses a missing worktree or --even-so without a because before asking the office', async () => {
  for (const args of [['--even-so'], ['--even-so', '   ']]) {
    const out = await remove(args)
    expect(out.code, out.output).toBe(1)
    expect(out.output).toContain('because')
    expect(existsSync(tree)).toBe(true)
  }
  const missing = await remove([], api, join(root, 'not-there'))
  expect(missing.code, missing.output).toBe(1)
  expect(missing.output).toContain('not-there')
  expect(requests).toEqual([])
})

it.each([{ args: [] }, { args: ['--even-so', 'Synthetic reason cannot authorize unseen evidence'] }])('a positive hidden count keeps the worktree with %j', async ({ args }) => {
  body = { ...answer([]), hiddenCount: 2 }
  const out = await remove(args)
  expect(out.code, out.output).toBe(2)
  expect(existsSync(tree)).toBe(true)
  expect(out.output).toContain(`Nothing was removed: 2 records name files inside ${tree}, 0 you can read and 2 you may not.`)
  expect(existsSync(join(root, 'git-trace.log'))).toBe(false)
})

it.each([{ args: [] }, { args: ['--even-so', 'Synthetic reason cannot authorize unseen evidence'] }])('readable and hidden records are counted in one sentence with %j', async ({ args }) => {
  body = { ...answer([heldRecord()]), hiddenCount: 2 }
  const out = await remove(args)
  expect(out.code, out.output).toBe(2)
  expect(existsSync(tree)).toBe(true)
  expect(out.output).toContain(`Nothing was removed: 3 records name files inside ${tree}, 1 you can read and 2 you may not.`)
  // The one the caller can read is still listed, with the paths it names.
  for (const word of ['test-report-id', 'Test evidence to keep', join(tree, 'source.ts')]) expect(out.output).toContain(word)
  expect(existsSync(join(root, 'git-trace.log'))).toBe(false)
})

it.each([undefined, -1])('an incomplete hidden count %j keeps the worktree', async hiddenCount => {
  body = { ...answer([]), hiddenCount }
  const out = await remove()
  expect(out.code, out.output).toBe(1)
  expect(existsSync(tree)).toBe(true)
  expect(out.output).toContain('Nothing was removed')
})

/**
 * Commit a .gitignore in the worktree and put a branch on it, so the ignored files, and not a commit on no ref, decide
 * whether the worktree goes.
 */
function commitAGitignore(lines: string[]) {
  writeFileSync(join(tree, '.gitignore'), lines.map((line) => `${line}\n`).join(''))
  git('-C', tree, 'add', '--', '.gitignore')
  git('-C', tree, 'commit', '-q', '-m', 'Test ignored files')
  git('-C', tree, 'branch', 'test-ignored-files')
}

// AN IGNORED FILE THAT NO BUILD, INSTALL OR RENDER MAKES AGAIN KEEPS THE WORKTREE, AND IS NAMED BY ITS PATH. Git's removal
// with --force deletes ignored files with the worktree, so a run's logs, which records cite, went with it. Only what
// the tool's list says a build makes again from tracked files may go.
it('keeps a worktree whose ignored file no build makes again, names the file, and runs no removal', async () => {
  commitAGitignore(['.logs/'])
  mkdirSync(join(tree, '.logs'))
  writeFileSync(join(tree, '.logs', 'run.log'), 'A run log that a record cites.\n')
  const out = await remove()
  expect(out.code, out.output).toBe(1)
  expect(existsSync(tree)).toBe(true)
  expect(readFileSync(join(tree, '.logs', 'run.log'), 'utf8')).toBe('A run log that a record cites.\n')
  expect(out.output.split('\n')).toContain('.logs/run.log')
  expect(readFileSync(join(root, 'git-trace.log'), 'utf8')).not.toContain('worktree remove')
})

it('removes a worktree whose ignored files are all under dist/ and a node_modules link, as before', async () => {
  commitAGitignore(['dist/', 'node_modules'])
  mkdirSync(join(tree, 'dist'))
  writeFileSync(join(tree, 'dist', 'app.js'), 'Test build output.\n')
  // A worktree's node_modules is a link to the checkout's, so the link goes with the worktree and its folder does not.
  const installed = join(root, 'installed')
  mkdirSync(installed)
  writeFileSync(join(installed, 'index.js'), 'Test installed package.\n')
  symlinkSync(installed, join(tree, 'node_modules'))
  const out = await remove()
  expect(out.code, out.output).toBe(0)
  expect(existsSync(tree)).toBe(false)
  expect(git('-C', repository, 'worktree', 'list', '--porcelain')).not.toContain(tree)
  expect(existsSync(join(installed, 'index.js'))).toBe(true)
})

// A .env MAY HOLD KEYS, so the tool names it by its path and never reads or prints what it holds.
it('keeps a worktree with an ignored .env, names it by its path, and prints nothing it holds', async () => {
  const value = 'made-up-value-that-is-not-a-key'
  commitAGitignore(['.env'])
  writeFileSync(join(tree, '.env'), `MADE_UP_SETTING=${value}\n`)
  const out = await remove()
  expect(out.code, out.output).toBe(1)
  expect(existsSync(tree)).toBe(true)
  expect(readFileSync(join(tree, '.env'), 'utf8')).toBe(`MADE_UP_SETTING=${value}\n`)
  expect(out.output.split('\n')).toContain('.env')
  expect(out.output).not.toContain(value)
})
