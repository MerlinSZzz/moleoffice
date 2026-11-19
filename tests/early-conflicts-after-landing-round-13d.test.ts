// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE EARLY CONFLICT WARNING READS A COMMIT THE ROOT DOES NOT HOLD YET (wave 13v, round 13d). After a landing, the
 * merge tool's conflictsAfterLanding (tools/merge-tool/office-keeper.mjs) looks at every judged entry of the lane. When
 * an entry's commit is not in the lane's root, it fetches it from the entry's run's worktree, then replays it onto the
 * new main and warns of each file that conflicts. Until this round the function called tryGit without importing it,
 * so every such fetch failed with a ReferenceError, the catch wrote it down as "could not read its commit", and the
 * warning was lost.
 *
 * This test runs the real function, with no stub, against two temporary git repositories: a root whose main moved,
 * and a worktree that holds the entry's commit. The office is a small HTTP server of this test's own.
 *
 * MUTATION PROOF, 9 October 2026 (logs named in report JdWlZRIRdfVq, block r13d), each alone after a green control:
 *   - tryGit taken out of the import from ./git.mjs again: all three cases go red on the ReferenceError;
 *   - the inner catch logs every error again instead of only a MergerFailure: case 2 goes red;
 *   - the whole function as it was before this round: cases 1 and 2 go red.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let office: Server
let answer: (request: IncomingMessage, reply: ServerResponse) => void = (_request, reply) => reply.end('{}')
let scratch = ''
let root = ''
let worktree = ''
let mainAfter = ''
let entryCommit = ''
let keeper: typeof import('../tools/merge-tool/office-keeper.mjs')
let theLog = ''

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-c', 'user.name=Synthetic author', '-c', 'user.email=synthetic@invalid', '-C', cwd, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

function json(reply: ServerResponse, status: number, body: unknown): void {
  reply.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))
}

/** The office's lane holds one judged git entry, whose commit lives only in the worktree; its run is `run`. */
function anOffice(run: unknown): (request: IncomingMessage, reply: ServerResponse) => void {
  return (request, reply) => {
    request.resume()
    const url = request.url ?? ''
    if (url.startsWith('/api/merge-queue?lane=')) {
      const entry = { id: 'synthetic-entry', state: 'judged', run: 'synthetic-run', changeset: { adapter: 'git', root, commit: entryCommit } }
      json(reply, 200, { lanes: [{ lane: root, entries: [entry] }] })
    } else if (url === '/api/records/synthetic-run') json(reply, 200, run)
    else json(reply, 404, { error: `This synthetic office has no ${url}.` })
  }
}

beforeAll(async () => {
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-early-conflicts-'))
  root = join(scratch, 'root')
  mkdirSync(root)
  git(root, 'init', '--quiet', '--initial-branch=main')
  writeFileSync(join(root, 'shared.txt'), 'the first line\n')
  git(root, 'add', 'shared.txt')
  git(root, 'commit', '--quiet', '-m', 'The base both sides start from')
  worktree = join(scratch, 'worktree')
  git(scratch, 'clone', '--quiet', root, worktree)
  writeFileSync(join(worktree, 'shared.txt'), 'the entry wrote this line\n')
  git(worktree, 'commit', '--quiet', '-am', 'The entry changes the line')
  entryCommit = git(worktree, 'rev-parse', 'HEAD')
  writeFileSync(join(root, 'shared.txt'), 'main wrote this line\n')
  git(root, 'commit', '--quiet', '-am', 'Main changes the same line')
  mainAfter = git(root, 'rev-parse', 'HEAD')

  office = createServer((request, reply) => answer(request, reply))
  await new Promise<void>((ok) => office.listen(0, '127.0.0.1', ok))
  const workdir = join(scratch, 'workdir')
  mkdirSync(workdir)
  const argv = process.argv
  process.argv = [argv[0]!, argv[1]!, '--entry', 'synthetic-entry', '--session', 'synthetic-session', '--workdir', workdir,
    '--api', `http://127.0.0.1:${String((office.address() as AddressInfo).port)}`, '--office-for', '6']
  try {
    keeper = await import('../tools/merge-tool/office-keeper.mjs')
    theLog = (await import('../tools/merge-tool/arguments.mjs')).LOG
  } finally {
    process.argv = argv
  }
})

afterAll(async () => {
  await new Promise<void>((ok) => office.close(() => ok()))
  if (scratch !== '') rmSync(scratch, { recursive: true, force: true })
})

function theLogText(): string {
  try {
    return readFileSync(theLog, 'utf8')
  } catch {
    return ''
  }
}

describe('conflictsAfterLanding, run for real', () => {
  it('1: fetches a commit the root does not hold from the run\'s worktree, and warns of its conflict', async () => {
    expect(() => git(root, 'cat-file', '-e', `${entryCommit}^{commit}`)).toThrow()
    answer = anOffice({ record: { id: 'synthetic-run', data: { workingDirectory: worktree } } })
    const warnings = await keeper.conflictsAfterLanding(root, mainAfter)
    expect(warnings).toEqual([{ entry: 'synthetic-entry', tip: entryCommit, files: ['shared.txt'], commit: entryCommit, lines: [{ path: 'shared.txt', ranges: '1-5' }] }])
    expect(theLogText()).not.toContain('could not read its commit')
  }, 30_000)

  it('2: a fault in the code is thrown, not written down as a commit it could not read', async () => {
    const before = theLogText()
    // The office answers with no record at all, so reading the run's worktree is a TypeError in this code's own hands.
    answer = anOffice({})
    // A fresh root again: case 1 fetched the entry's commit into the first one. --no-local copies only what main reaches.
    const fresh = join(scratch, 'second-root')
    git(scratch, 'clone', '--quiet', '--no-local', root, fresh)
    root = fresh
    expect(() => git(root, 'cat-file', '-e', `${entryCommit}^{commit}`)).toThrow()
    await expect(keeper.conflictsAfterLanding(root, mainAfter)).rejects.toBeInstanceOf(TypeError)
    expect(theLogText().slice(before.length)).not.toContain('could not read its commit')
  }, 30_000)

  it('3: a commit that really cannot be read is written down, and the landing goes on', async () => {
    const before = theLogText()
    answer = anOffice({ record: { id: 'synthetic-run', data: { workingDirectory: join(scratch, 'no-such-worktree') } } })
    const warnings = await keeper.conflictsAfterLanding(root, mainAfter)
    expect(warnings).toEqual([])
    expect(theLogText().slice(before.length)).toContain('early conflict probe for synthetic-entry could not read its commit')
  }, 30_000)
})
