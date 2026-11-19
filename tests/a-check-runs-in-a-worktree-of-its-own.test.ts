// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Each check has its own identity. Writes-nothing still means no verdict. Failed checks retain trees until this fixture tears down its exact paths. */
import { aFixtureSeatDoor, aMadeUpCheckSession, fixtureOfficeDatabase } from './inspector-tool-fixture.ts'
/** Eligibility fixture update: the old HTTP stand-in had no eligibility door. It now explicitly answers eligible so this test reaches its original subject. */
/**
 * A CHECK RUNS IN A WORKTREE OF ITS OWN, AT THE RUN'S TIP, AND PUTS IT BACK.
 *
 * Criterion C30, added to C28 after the first check the office started.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * That check ran inside the worker's own worktree. It read the tree while the worker still had it,
 * and the run it started built and ran suites there, contending with the worker's own build over
 * the same node_modules, the same dist and the same ports. Two processes writing one working tree
 * is not a check of it: what the check read is not what it reported on, and the worker's own run
 * was slowed by the thing checking it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE HOLDS
 * ---------------------------------------------------------------------------------------
 *
 *   1. The check does not read or run in the worker's checkout. The model is started somewhere
 *      else, and that somewhere is a git worktree at the same commit.
 *   2. It is the run's TIP that is checked, not whatever the worker has half-saved. A file the
 *      worker has written but not committed is absent from the tree the check reads.
 *   3. The worktree is one a test can actually run in: it sits under
 *      `~/.cache/mole-office/worktrees/`, it has `node_modules`, and nothing is built. Until
 *      14 October 2026 chapter 3 also required a build. The first pass of this criterion
 *      had none of it — a bare tree cut into `os.tmpdir()`, which fails tests/source-api.test.ts
 *      (no `dist/`) and tests/restore-check.test.ts (outside `/home`), and in which no check could
 *      run a test. A model runs its own build only for a test that needs dist/.
 *   4. What it cut is removed afterwards, so the repository is left as it was found.
 *   5. An inspector reaching into the WORKER'S tree by absolute path is still caught. The first
 *      draft of this criterion opened that hole: once the check reads its own tree, an edit to the
 *      worker's shows up in neither photograph. Both are watched now, and this case is why.
 *
 * THE STAND-IN `claude` HERE REALLY USES `node_modules`. It requires a package out of it and reads
 * whether the build wrote a file, and says what it found. A missing dependency link fails this file, and
 * so does a build, which item 3 rules out.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT GOES RED WHEN THE CODE IS REMOVED. Control run first.
 * ---------------------------------------------------------------------------------------
 *
 *   - Take the `aWorktreeOfItsOwn()` call out and the first four cases go red: the model runs in
 *     the worker's checkout, it sees the uncommitted file, and nothing is cut, prepared or removed.
 *   - Take `soATestCanRunThere` out, and the third goes red: no node_modules.
 *   - Put the host build back, and the third goes red: it sees the build file instead of NO-BUILD.
 *   - Cut it into `os.tmpdir()` again, and the third goes red on where it is.
 *   - Stop `theWorktreeIsPutBack` removing it, and the fourth goes red with the worktree still listed.
 *   - Photograph only the check's own tree in `howTheCheckoutStands`, and the fifth goes red.
 */
import { spawn, execFileSync, type ChildProcess } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { theOwnersEffort } from '../src/config/model-efforts.mjs'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const INSPECTOR = join(REPO, 'tools', 'the-inspector.mjs')
const RUN = 'RunInAWorktreeOfItsOwn'
/**
 * THE OFFICE HERE IS AN OLDER ONE: its run-models door gives no native selection, so the tool starts the check from the
 * compatibility list (src/config/launcher-model-compatibility.json). The model is one that list names, and the door
 * answers it at its start value, as such an office does. A model the list does not name is refused before anything starts.
 */
const THE_MODEL = 'claude-sonnet-5'

const fixtureTrees = new Set<string>()
// Problem h09tYuNl1nd9; the secretary's Vv6h0HVryXOe: each file run owns its worktree base.
mkdirSync(join(REPO, '.logs'), { recursive: true })
const fixtureBase = mkdtempSync(join(REPO, '.logs', 'check-own-worktrees-'))
let office: Server
let api = ''
let bin = ''
let checkout = ''
/** Where the stand-in `claude` writes down the directory it was started in. */
let saidWhere = ''
/** Every write the tool made to the office, by path. */
const writes: string[] = []

afterEach(() => {
  // A failed check deliberately retains its tree under this run's fixtureBase until fixture teardown.
  for (const at of fixtureTrees) { try { execFileSync('git', ['-C', checkout, 'worktree', 'remove', '--force', at], { stdio: 'ignore' }) } catch { /* already removed */ } }
  fixtureTrees.clear()
})

beforeAll(async () => {
  office = createServer((request, reply) => {
    if (aFixtureSeatDoor(request, reply)) return
    const path = request.url ?? ''
    if (request.method === 'POST') writes.push(path)
    reply.setHeader('content-type', 'application/json')
    if (request.url?.endsWith('/eligibility')) {
      reply.end(JSON.stringify({ eligible: true, code: 'CHECK_ELIGIBLE' }))
      return
    }
    if (path.startsWith('/api/office/run-models/for/')) {
      reply.end(JSON.stringify({ runtime: 'claude-code', model: THE_MODEL, variant: theOwnersEffort(THE_MODEL) }))
      return
    }
    if (request.method === 'GET' && path === `/api/checks/${RUN}`) {
      reply.end(JSON.stringify({ title: 'A run checked in a worktree of its own', workArea: ['work'], chaptersSays: 'none' }))
      return
    }
    request.resume()
    request.on('end', () => {
      if (request.method === 'POST' && path === `/api/checks/${RUN}/prompt`) {
        reply.end(
          JSON.stringify({
            prompt: 'A prompt this test made up. It is not a real check.',
            bytes: 52,
            wholeCodeBytes: 0,
            chaptersAt: [],
            changes: { inside: [], outside: [] },
          }),
        )
        return
      }
      reply.end(JSON.stringify({ ok: true }))
    })
  })
  await new Promise<void>((ok) => {
    office.listen(0, '127.0.0.1', ok)
  })
  const at = office.address()
  if (at === null || typeof at === 'string') throw new Error('the office reported no port')
  api = `http://127.0.0.1:${String(at.port)}`
  bin = mkdtempSync(join(tmpdir(), 'mole-office-a-stand-in-claude-'))
  saidWhere = join(bin, 'where-it-ran.txt')

  // THE WORKER'S CHECKOUT: a base branch, the work committed on a branch cut from it, and one file
  // written but NOT committed, which is what a worker's tree looks like while it is still being used.
  checkout = mkdtempSync(join(tmpdir(), 'mole-office-the-workers-tree-'))
  const git = (...argv: string[]): void => {
    execFileSync('git', argv, { cwd: checkout, stdio: 'ignore' })
  }
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 'a-test@example.invalid')
  git('config', 'user.name', 'A test')
  mkdirSync(join(checkout, 'work'))
  writeFileSync(join(checkout, 'work', 'the-work.txt'), 'Before.\n')
  git('add', '-A')
  git('commit', '-q', '-m', 'Before the work')
  // A PACKAGE.JSON WITH A REAL BUILD, so this checkout is one a suite could run in and the check's
  // worktree has something to link and something to build. The build writes a file the stand-in can
  // look for, which is how "it was built" becomes a thing this file can see rather than assume.
  writeFileSync(
    join(checkout, 'package.json'),
    JSON.stringify(
      {
        name: 'a-checkout-under-check',
        private: true,
        scripts: { build: `node -e "require('node:fs').writeFileSync('the-build-ran.txt','yes')"` },
      },
      null,
      1,
    ) + '\n',
  )
  writeFileSync(join(checkout, '.gitignore'), 'node_modules\ndist\nthe-build-ran.txt\n')
  git('add', '-A')
  git('commit', '-q', '-m', 'A checkout with a build')
  // THE WORKER'S OWN node_modules, itself a symlink into the main checkout, exactly as every
  // worktree in this repository has it — and NOT committed, which is why the .gitignore is above.
  // A committed node_modules would arrive in the check's worktree with the checkout and the link
  // would then be refused, which is a different repository from the one this file means.
  symlinkSync(join(REPO, 'node_modules'), join(checkout, 'node_modules'), 'dir')

  git('checkout', '-q', '-b', 'the-work')
  writeFileSync(join(checkout, 'work', 'the-work.txt'), 'Before.\nAnd what the worker committed.\n')
  git('commit', '-qam', 'The work under check')
  writeFileSync(join(checkout, 'work', 'half-saved.txt'), 'What the worker has not committed yet.\n')
})

afterAll(async () => {
  await new Promise<void>((ok) => {
    office.close(() => {
      ok()
    })
  })
  rmSync(bin, { recursive: true, force: true })
  rmSync(checkout, { recursive: true, force: true })
  rmSync(fixtureBase, { recursive: true, force: true })
})

/** Put a `claude` on PATH that writes down where it was started and what it could see. */
function standInClaude(body: string): void {
  const file = join(bin, 'claude')
  writeFileSync(
    file,
    `#!/bin/sh\n# A STAND-IN FOR THE claude COMMAND, written by a test. It runs no model.\n` +
      `cat >/dev/null\n` +
      // WHERE IT RAN, WHAT IT COULD SEE, WHETHER THE BUILD HAD RUN, AND WHETHER node_modules WORKS.
      // The last one is a real resolve out of node_modules, so a worktree without it fails here.
      `{ pwd; ls work; ls the-build-ran.txt 2>/dev/null || echo NO-BUILD; ` +
      `node -e "require.resolve('vitest'); console.log('NODE-MODULES-WORKS')" 2>/dev/null || echo NO-NODE-MODULES; ` +
      `} > "${saidWhere}"\n${body}\n`,
  )
  chmodSync(file, 0o755)
}

function inspect(flags: string[] = []): Promise<{ code: number | null; out: string; err: string }> {
  const checkId = aMadeUpCheckSession()
  fixtureTrees.add(join(fixtureBase, 'a-check-of-' + RUN + '-' + checkId))
  return new Promise((done) => {
    const child: ChildProcess = spawn(
      process.execPath,
      // THE STAND-IN claude IS ON THIS MACHINE'S PATH, so the model is run here: --on-the-host. The sandbox
      // path is tests/the-inspector-builds-and-runs-its-model-in-a-sandbox.test.ts.
      [INSPECTOR, '--check', checkId, '--run', RUN, '--as', 'inspector-one', '--api', api, '--workspace', 'panelx', '--checkout', checkout, '--model', THE_MODEL, '--on-the-host', ...flags],
      { cwd: REPO, env: { ...process.env, MOLE_OFFICE_DB: fixtureOfficeDatabase(fixtureBase), MOLE_OFFICE_CHECK_WORKTREES: fixtureBase, PATH: `${bin}:${process.env.PATH ?? ''}` }, stdio: ['ignore', 'pipe', 'pipe'] },
    )
    let out = ''
    let err = ''
    child.stdout?.on('data', (d) => {
      out += String(d)
    })
    child.stderr?.on('data', (d) => {
      err += String(d)
    })
    child.on('close', (code) => {
      done({ code, out, err })
    })
  })
}

/** Every worktree the worker's repository holds, by path. */
function worktreesOf(repo: string): string[] {
  return execFileSync('git', ['-C', repo, 'worktree', 'list', '--porcelain'], { encoding: 'utf8' })
    .split('\n')
    .filter((line) => line.startsWith('worktree '))
    .map((line) => line.slice('worktree '.length).trim())
}

const A_RELEASE = JSON.stringify({ verdict: 'released', check: 'Nothing is missing.', chaptersRead: [] })

describe('a check runs in a worktree of its own', () => {
  it('starts the model somewhere that is not the worker\'s checkout', async () => {
    writes.length = 0
    standInClaude(`echo '{"result":${JSON.stringify(A_RELEASE)}}'`)
    const ran = await inspect()
    expect(ran.code, ran.err).toBe(0)

    const where = readFileSync(saidWhere, 'utf8').split('\n')[0] ?? ''
    expect(where, 'the model ran in the worker\'s own checkout').not.toBe(checkout)
    expect(where).not.toBe('')
    expect(ran.out).toContain('The worker\'s tree is not touched.')
  })

  it('reads the run\'s tip, so a file the worker has not committed is not in it', async () => {
    writes.length = 0
    standInClaude(`echo '{"result":${JSON.stringify(A_RELEASE)}}'`)
    const ran = await inspect()
    expect(ran.code, ran.err).toBe(0)

    const seen = readFileSync(saidWhere, 'utf8')
    expect(seen).toContain('the-work.txt')
    // THE WHOLE POINT of checking the tip: half-saved.txt is in the worker's tree and not in this one.
    expect(seen).not.toContain('half-saved.txt')
    expect(existsSync(join(checkout, 'work', 'half-saved.txt')), 'the worker lost its uncommitted file').toBe(true)
  })

  it('is a worktree a test can run in: under ~/.cache, with node_modules and no build', async () => {
    writes.length = 0
    standInClaude(`echo '{"result":${JSON.stringify(A_RELEASE)}}'`)
    const ran = await inspect()
    expect(ran.code, ran.err).toBe(0)

    // CHAPTER 3 RULE 1: not in the owner's home directory, and `~/.cache` is where a worktree goes. Since
    // flow-2 (8 September 2026) this file points the tool at its own fixture directory through
    // MOLE_OFFICE_CHECK_WORKTREES, so that two suites cannot collide under the shared
    // ~/.cache/mole-office/worktrees; the assertion that the tool cut where it was told is what
    // holds here. The old assertion, that the path began with ~/.cache/mole-office/worktrees, was
    // true only when the checkout itself sat under that directory (a builder's worktree) and red on
    // main (8 September, 22:07): it read the fixture's location, not the tool's rule.
    const cutAt = /cut at (\S+)\./u.exec(ran.out)?.[1] ?? ''
    expect(cutAt).not.toBe('')
    expect(cutAt.startsWith(fixtureBase), `cut at ${cutAt}, not under the fixture directory ${fixtureBase}`).toBe(true)
    expect(cutAt.includes(join(homedir(), 'Desktop')) || cutAt === homedir()).toBe(false)
    expect(cutAt.startsWith(tmpdir())).toBe(false)

    // THE RECIPE: node_modules linked from the checkout it came from, with no build before it runs.
    expect(ran.out).toContain('node_modules is linked from')
    expect.soft(ran.out).toContain('Nothing was built. The merge queue builds and runs the tests.')

    // AND THE MODEL REALLY USED IT. The stand-in resolves a package out of node_modules and looks
    // for a file the build would write; NO-BUILD confirms that nothing built it.
    const seen = readFileSync(saidWhere, 'utf8')
    expect(seen, 'the check ran in a worktree with no node_modules').toContain('NODE-MODULES-WORKS')
    expect(seen).not.toContain('NO-NODE-MODULES')
    expect.soft(seen, 'the check built its worktree').toContain('NO-BUILD')
    expect.soft(seen).not.toContain('the-build-ran.txt')
  })

  it('removes what it cut, so the repository is left as it was found', async () => {
    const before = worktreesOf(checkout)
    writes.length = 0
    standInClaude(`echo '{"result":${JSON.stringify(A_RELEASE)}}'`)
    const ran = await inspect()
    expect(ran.code, ran.err).toBe(0)
    expect(ran.out).toContain('is removed.')
    expect(worktreesOf(checkout)).toEqual(before)

    // And it is gone from disk, not only from git's list.
    const cutAt = /cut at (\S+)\./u.exec(ran.out)?.[1] ?? ''
    expect(cutAt).not.toBe('')
    expect(existsSync(cutAt), 'the worktree this check cut is still on disk').toBe(false)
  })

  it('still catches an inspector that reaches into the worker\'s own tree', async () => {
    writes.length = 0
    // The worktree the check reads is not the worker's, so an edit BY ABSOLUTE PATH would show up in
    // neither photograph unless both are watched. This is the hole the first draft of C30 opened.
    standInClaude(
      `printf 'a fix the inspector wrote\\n' > "${checkout}/the-fix.txt"; ` +
        `echo '{"result":${JSON.stringify(A_RELEASE)}}'`,
    )
    const ran = await inspect()
    expect(ran.code).toBe(1)
    expect(ran.err).toContain('changed the work it was checking')
    expect(ran.err).toContain("in the worker's own checkout")
    expect(ran.err).toContain('the-fix.txt')
    // NOTHING WAS POSTED: the assembly is kept, the verdict is not.
    expect(writes).toEqual([`/api/checks/${RUN}/prompt`, `/api/checks/${RUN}/assembled`])
    rmSync(join(checkout, 'the-fix.txt'), { force: true })
  })
})
