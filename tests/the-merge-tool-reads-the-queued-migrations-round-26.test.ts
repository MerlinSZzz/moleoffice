// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MERGE TOOL READS THE MIGRATIONS THE OTHER QUEUED ENTRIES CARRY (wave 13v round 26). On 11 October 2026 entry
 * T3pwIZzVrDF3 was renumbered from 0215 to 0232, and entry OxvNQdAtwq6y, ahead of it in the queue, already carried 0232.
 * theMigrationsQueued (tools/merge-tool/office-keeper.mjs) reads the journal of every other git entry of the lane that is
 * not final, so the renumbering can go above them, and says which it could not read.
 *
 * This test runs the real function, with no stub, against temporary git repositories: a root, and a worktree that holds
 * one entry's commit. The office is a small HTTP server of this test's own, as in the round 13d test of
 * conflictsAfterLanding.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let office: Server
let laneStatus = 200
let scratch = ''
let root = ''
let worktree = ''
const commits: Record<string, string> = {}
let keeper: typeof import('../tools/merge-tool/office-keeper.mjs')

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-c', 'user.name=Synthetic author', '-c', 'user.email=synthetic@invalid', '-C', cwd, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}
const row = (idx: number, when: number, name: string) => ({ idx, version: '6', when, tag: `${String(idx).padStart(4, '0')}_${name}`, breakpoints: true })
/** One commit on a branch of `repo` from main, whose journal is main's rows and `rows`, or the text `raw`. */
function aBranch(repo: string, name: string, rows: ReturnType<typeof row>[], raw?: string): string {
  git(repo, 'switch', '--quiet', '-c', name, 'main')
  writeFileSync(join(repo, 'drizzle/meta/_journal.json'), raw ?? JSON.stringify({ version: '7', dialect: 'sqlite', entries: [row(0, 100, 'base'), ...rows] }))
  git(repo, 'commit', '--quiet', '-am', `Synthetic ${name}`)
  const commit = git(repo, 'rev-parse', 'HEAD')
  git(repo, 'switch', '--quiet', 'main')
  return commit
}
function json(reply: ServerResponse, status: number, body: unknown): void {
  reply.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))
}
const aGitEntry = (id: string, state: string, run: string, commit: string) => ({ id, state, run, changeset: { adapter: 'git', root, commit } })
function theOffice(request: IncomingMessage, reply: ServerResponse): void {
  request.resume()
  const url = request.url ?? ''
  if (url.startsWith('/api/merge-queue?lane=')) {
    if (laneStatus !== 200) return json(reply, laneStatus, { error: 'Synthetic: the lane cannot be read.' })
    json(reply, 200, { lanes: [{ lane: root, entries: [
      aGitEntry('this-entry', 'integrating', 'run-this', commits['this']!),
      aGitEntry('OxvNQdAtwq6y', 'judged', 'run-in-root', commits['ahead']!),
      aGitEntry('in-a-worktree', 'submitted', 'run-in-worktree', commits['worktree']!),
      aGitEntry('landed-already', 'merged', 'run-landed', commits['landed']!),
      { id: 'a-files-entry', state: 'judged', run: 'run-files', changeset: { adapter: 'files', root } },
      aGitEntry('no-worktree', 'pinned', 'run-without-worktree', '0123456789abcdef0123456789abcdef01234567'),
      aGitEntry('not-json', 'judged', 'run-not-json', commits['broken']!),
      aGitEntry('no-number', 'judged', 'run-no-number', commits['unnumbered']!),
    ] }] })
  } else if (url === '/api/records/run-in-worktree') json(reply, 200, { record: { id: 'run-in-worktree', data: { workingDirectory: worktree } } })
  else if (url === '/api/records/run-without-worktree') json(reply, 200, { record: { id: 'run-without-worktree', data: {} } })
  else json(reply, 404, { error: `This synthetic office has no ${url}.` })
}

beforeAll(async () => {
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-queued-migrations-'))
  root = join(scratch, 'root')
  mkdirSync(join(root, 'drizzle/meta'), { recursive: true })
  git(root, 'init', '--quiet', '--initial-branch=main')
  writeFileSync(join(root, 'drizzle/meta/_journal.json'), JSON.stringify({ version: '7', dialect: 'sqlite', entries: [row(0, 100, 'base')] }))
  git(root, 'add', '-A')
  git(root, 'commit', '--quiet', '-m', 'Synthetic main')
  worktree = join(scratch, 'worktree')
  git(scratch, 'clone', '--quiet', root, worktree)
  commits['this'] = aBranch(root, 'this', [row(1, 200, 'this_entry')])
  commits['ahead'] = aBranch(root, 'ahead', [row(2, 300, 'ahead')])
  commits['landed'] = aBranch(root, 'landed', [row(9, 900, 'landed')])
  commits['broken'] = aBranch(root, 'broken', [], '{ not json')
  commits['unnumbered'] = aBranch(root, 'unnumbered', [], JSON.stringify({ entries: [{ idx: 'four', when: 400, tag: '0004_unnumbered' }] }))
  commits['worktree'] = aBranch(worktree, 'worktree', [row(3, 400, 'in_worktree')])

  office = createServer(theOffice)
  await new Promise<void>((ok) => office.listen(0, '127.0.0.1', ok))
  const workdir = join(scratch, 'workdir')
  mkdirSync(workdir)
  const argv = process.argv
  process.argv = [argv[0]!, argv[1]!, '--entry', 'this-entry', '--session', 'synthetic-session', '--workdir', workdir,
    '--api', `http://127.0.0.1:${String((office.address() as AddressInfo).port)}`, '--office-for', '6']
  try {
    keeper = await import('../tools/merge-tool/office-keeper.mjs')
  } finally {
    process.argv = argv
  }
})

afterAll(async () => {
  await new Promise<void>((ok) => office.close(() => ok()))
  if (scratch !== '') rmSync(scratch, { recursive: true, force: true })
})

// MUTATION PROOF (after a green control), each alone: count a final entry as queued, and landed-already is read; never
// fetch a commit the root lacks, and in-a-worktree is not read; take rows without checking their numbers, and no-number
// is read. Each turns this case red.
it('reads every other queued git entry of the lane, fetching a commit only a run\'s worktree holds, and names those it could not read', async () => {
  laneStatus = 200
  const queued = await keeper.theMigrationsQueued(root, { id: 'this-entry' })
  expect(queued.lane).toBeNull()
  // NOT this entry, NOT a merged one, NOT a files entry.
  expect(queued.read).toEqual(['OxvNQdAtwq6y', 'in-a-worktree'])
  expect(queued.rows.filter((one) => one.idx > 0).map((one) => `${one.tag}@${String(one.when)} ${one.entry}`)).toEqual([
    '0002_ahead@300 OxvNQdAtwq6y',
    '0003_in_worktree@400 in-a-worktree',
  ])
  expect(queued.unread.map((one) => one.entry)).toEqual(['no-worktree', 'not-json', 'no-number'])
  expect(queued.unread[0]!.why).toContain('run run-without-worktree has no worktree from which to read its commit')
  expect(queued.unread[1]!.why).toContain('is not JSON')
  expect(queued.unread[2]!.why).toContain('has a row without a whole idx, a whole when and a tag')
}, 60_000)

it('says why when the lane cannot be read, and reads nothing', async () => {
  laneStatus = 500
  const queued = await keeper.theMigrationsQueued(root, { id: 'this-entry' })
  expect(queued).toEqual({ rows: [], read: [], unread: [], lane: 'the office would not give the lane (500): Synthetic: the lane cannot be read.' })
}, 60_000)
