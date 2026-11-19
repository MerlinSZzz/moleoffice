// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CHECK ON THE HOST THAT FINDS ITS WORKTREE TAKEN IS COUNTED ONCE IN THE GATE-COUNT SPOOL (wave 13r round AC, item 10f).
 *
 * CK-23 a-check-reads-its-own-worktree is met where the inspector, run on the host, refuses to cut its worktree because
 * one is already at its place. There are two such exits in aWorktreeOfItsOwn: a tree with a saved model state it cannot
 * resume, and a tree with no saved state at all. Each keeps the tree, exits 1, and writes one line with no sandbox,
 * since the check runs on the host.
 *
 * The inspector is started as a child with a copy of this test's environment, so it counts into the spool under this
 * test file's own home (tests/a-test-writes-into-no-home-but-its-own.ts). The office it reads is a stand-in on a port of
 * its own, and the checkout is a temporary repository. No model runs: both exits come before one would start.
 *
 * MUTATIONS, each planted alone after a control run:
 *   - take the call out of the catch for a saved state it cannot resume: the first case;
 *   - take the call out before "is already there": the second case;
 *   - give either call a sandbox name, or 'remind': the case it is in;
 *   - call it a second time on either exit: the case it is in.
 */
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { aMadeUpCheckSession } from './inspector-tool-fixture.ts'
import { aStampOf, emptyATestsOwnSpool, theLinesIn, theSpoolUnder } from './the-gate-count-spool-under-a-home.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const INSPECTOR = join(REPO, 'tools', 'the-inspector.mjs')
const RUN = 'RunWithItsWorktreeTaken'
/** The spool the inspector writes when it inherits this test file's home. */
const SPOOL = theSpoolUnder(process.env.HOME ?? '')

let office: Server
let api = ''
let dir = ''
let checkout = ''
let base = ''

beforeAll(async () => {
  office = createServer((request, reply) => {
    const path = request.url ?? ''
    reply.setHeader('content-type', 'application/json')
    if (path.endsWith('/eligibility')) return void reply.end(JSON.stringify({eligible: true, code: 'CHECK_ELIGIBLE'}))
    if (path.startsWith('/api/office/run-models/for/')) return void reply.end(JSON.stringify({runtime: 'claude-code', model: 'none', variant: null}))
    if (request.method === 'GET' && path === `/api/checks/${RUN}`) {
      return void reply.end(JSON.stringify({title: 'A run whose check finds its worktree taken', workArea: ['work'], chaptersSays: 'none'}))
    }
    request.resume()
    request.on('end', () => reply.end(JSON.stringify({ok: true})))
  })
  await new Promise<void>((ok) => office.listen(0, '127.0.0.1', ok))
  const at = office.address()
  if (at === null || typeof at === 'string') throw new Error('The stand-in office reported no port.')
  api = `http://127.0.0.1:${String(at.port)}`
  dir = mkdtempSync(join(tmpdir(), 'mole-office-a-taken-worktree-'))
  checkout = join(dir, 'checkout')
  base = join(dir, 'worktrees')
  mkdirSync(join(checkout, 'work'), {recursive: true})
  mkdirSync(base)
  const git = (...argv: string[]): void => void execFileSync('git', argv, {cwd: checkout, stdio: 'ignore'})
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 'a-test@example.invalid')
  git('config', 'user.name', 'A test')
  writeFileSync(join(checkout, 'work', 'the-work.txt'), 'The work under check.\n')
  git('add', '-A')
  git('commit', '-q', '-m', 'The work under check')
})

afterAll(async () => {
  await new Promise<void>((ok) => office.close(() => ok()))
  rmSync(dir, {recursive: true, force: true})
})

beforeEach(() => {
  emptyATestsOwnSpool(SPOOL)
})

/** The inspector on the host for a check whose worktree place already holds a folder, and its saved state if given. */
function aCheckWhoseWorktreeIsTaken(savedState: string | null): Promise<{code: number | null; err: string; tree: string}> {
  const checkId = aMadeUpCheckSession()
  const tree = join(base, `a-check-of-${RUN}-${checkId}`)
  mkdirSync(tree)
  writeFileSync(join(tree, 'left-here.txt'), 'A folder already at the place.\n')
  if (savedState !== null) writeFileSync(join(base, `a-check-of-${RUN}-${checkId}-model.json`), savedState)
  return new Promise((done) => {
    const child = spawn(
      process.execPath,
      [INSPECTOR, '--check', checkId, '--run', RUN, '--as', 'inspector-one', '--api', api, '--workspace', 'panelx', '--checkout', checkout, '--model', 'none', '--on-the-host'],
      {cwd: REPO, env: {...process.env, MOLE_OFFICE_CHECK_WORKTREES: base}, stdio: ['ignore', 'pipe', 'pipe']},
    )
    let err = ''
    child.stdout?.resume()
    child.stderr?.on('data', (d) => {
      err += String(d)
    })
    child.on('close', (code) => done({code, err, tree}))
  })
}

describe('a check on the host that finds its worktree taken', () => {
  // Mutation: take the call out of the catch, give it a sandbox or 'remind', or call it twice.
  it('is counted once when the tree has a saved state it cannot resume', async () => {
    const before = aStampOf(new Date())
    const ran = await aCheckWhoseWorktreeIsTaken('{}\n')
    const after = aStampOf(new Date())
    expect(ran.code, ran.err).toBe(1)
    expect(ran.err).toContain('It cannot resume on claude-code model none. Start a fresh check session.')
    expect(ran.err).toContain('The existing worktree was kept.')
    expect(ran.err).not.toContain('is already there')
    expect(readFileSync(join(ran.tree, 'left-here.txt'), 'utf8')).toBe('A folder already at the place.\n')
    const lines = theLinesIn(SPOOL)
    expect(lines.map(({gate, position, sandbox}) => ({gate, position, sandbox}))).toEqual([
      {gate: 'a-check-reads-its-own-worktree', position: 'block', sandbox: null},
    ])
    expect(lines[0]!.at >= before && lines[0]!.at <= after, lines[0]!.at).toBe(true)
  }, 60_000)

  // Mutation: take the call out before "is already there", give it a sandbox or 'remind', or call it twice.
  it('is counted once when the tree is there with no saved state', async () => {
    const before = aStampOf(new Date())
    const ran = await aCheckWhoseWorktreeIsTaken(null)
    const after = aStampOf(new Date())
    expect(ran.code, ran.err).toBe(1)
    expect(ran.err).toContain(`${ran.tree} is already there, so this check did not put its worktree back.`)
    expect(existsSync(join(ran.tree, 'left-here.txt'))).toBe(true)
    const lines = theLinesIn(SPOOL)
    expect(lines.map(({gate, position, sandbox}) => ({gate, position, sandbox}))).toEqual([
      {gate: 'a-check-reads-its-own-worktree', position: 'block', sandbox: null},
    ])
    expect(lines[0]!.at >= before && lines[0]!.at <= after, lines[0]!.at).toBe(true)
  }, 60_000)
})
