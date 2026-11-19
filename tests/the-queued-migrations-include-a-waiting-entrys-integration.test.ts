// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE QUEUED MIGRATIONS INCLUDE THE NUMBERS A WAITING ENTRY WAS GIVEN AT ITS OWN INTEGRATION (wave 13u round 130).
 * theMigrationsQueued (tools/merge-tool/office-keeper.mjs) read each other entry's journal only at the commit it was
 * submitted with. One entry was submitted with migration 0306, renumbered to 0309 at its integration, and was waiting to
 * land. The next entry's renumbering read 0306 from it, chose 0309 as well, and the two collided. The journal at a
 * waiting entry's integration result is now read too, fetched from its integration clone when the root does not have it.
 *
 * This runs the real function, with no stub, against temporary git repositories: a root, and an integration clone that
 * holds one entry's integration result. The office is a small HTTP server of this test's own, as in the round 26 test of
 * the same function.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let office: Server
let scratch = ''
let root = ''
let clone = ''
const commits: Record<string, string> = {}
let keeper: typeof import('../tools/merge-tool/office-keeper.mjs')

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-c', 'user.name=Synthetic author', '-c', 'user.email=synthetic@invalid', '-C', cwd, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}
const row = (idx: number, when: number, name: string) => ({ idx, version: '6', when, tag: `${String(idx).padStart(4, '0')}_${name}`, breakpoints: true })
/** One commit on a branch of `repo` from main, whose journal is main's row and `rows`. */
function aBranch(repo: string, name: string, rows: ReturnType<typeof row>[]): string {
  git(repo, 'switch', '--quiet', '-c', name, 'main')
  writeFileSync(join(repo, 'drizzle/meta/_journal.json'), JSON.stringify({ version: '7', dialect: 'sqlite', entries: [row(0, 100, 'base'), ...rows] }))
  git(repo, 'commit', '--quiet', '-am', `Synthetic ${name}`)
  const commit = git(repo, 'rev-parse', 'HEAD')
  git(repo, 'switch', '--quiet', 'main')
  return commit
}
function json(reply: ServerResponse, status: number, body: unknown): void {
  reply.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))
}
const aGitEntry = (id: string, state: string, commit: string, integration?: { result: string; clone: string }) =>
  ({ id, state, run: `run-${id}`, changeset: { adapter: 'git', root, commit }, machine: integration === undefined ? {} : { integration } })
function theOffice(request: IncomingMessage, reply: ServerResponse): void {
  request.resume()
  const url = request.url ?? ''
  if (url.startsWith('/api/merge-queue?lane=')) {
    json(reply, 200, { lanes: [{ lane: root, entries: [
      aGitEntry('this-entry', 'integrating', commits['this']!),
      aGitEntry('renumbered-and-waiting', 'testing', commits['submitted']!, { result: commits['integrated']!, clone }),
      aGitEntry('clone-removed', 'landing', commits['submitted-too']!, { result: '0123456789abcdef0123456789abcdef01234567', clone: join(scratch, 'no-such-clone') }),
    ] }] })
  } else json(reply, 404, { error: `This synthetic office has no ${url}.` })
}

beforeAll(async () => {
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-queued-integration-'))
  root = join(scratch, 'root')
  mkdirSync(join(root, 'drizzle/meta'), { recursive: true })
  git(root, 'init', '--quiet', '--initial-branch=main')
  writeFileSync(join(root, 'drizzle/meta/_journal.json'), JSON.stringify({ version: '7', dialect: 'sqlite', entries: [row(0, 100, 'base')] }))
  git(root, 'add', '-A')
  git(root, 'commit', '--quiet', '-m', 'Synthetic main')
  commits['this'] = aBranch(root, 'this', [row(1, 200, 'this_entry')])
  commits['submitted'] = aBranch(root, 'submitted', [row(2, 300, 'stored_categories')])
  commits['submitted-too'] = aBranch(root, 'submitted-too', [row(2, 310, 'another_one')])
  // THE INTEGRATION CLONE borrows root's objects and adds its own result, which root does not have.
  clone = join(scratch, 'integration-clone')
  git(scratch, 'clone', '--quiet', '--shared', root, clone)
  commits['integrated'] = aBranch(clone, 'integrated', [row(5, 500, 'stored_categories')])

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

// MUTATION PROOF (after a green control), each alone: read only the submitted commit, and 0005 is missing; never fetch
// from the integration clone, and renumbered-and-waiting is unread. Each turns this case red.
it('reads the journal at a waiting entry\'s integration result as well as at its submitted commit, and names an entry whose result cannot be read', async () => {
  const queued = await keeper.theMigrationsQueued(root, { id: 'this-entry' })
  expect(queued.lane).toBeNull()
  expect(queued.read).toEqual(['renumbered-and-waiting'])
  expect(queued.rows.filter((one) => one.idx > 0).map((one) => `${one.tag}@${String(one.when)} ${one.entry}`)).toEqual([
    '0002_stored_categories@300 renumbered-and-waiting',
    '0005_stored_categories@500 renumbered-and-waiting',
  ])
  expect(queued.unread.map((one) => one.entry)).toEqual(['clone-removed'])
  expect(queued.unread[0]!.why).toContain('its integration result 0123456789ab')
}, 60_000)
