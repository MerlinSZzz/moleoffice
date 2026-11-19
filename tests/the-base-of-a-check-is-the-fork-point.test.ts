// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Eligibility fixture update: old sessions omitted their submitted checkout. Eligible fixtures now record the test checkout as workingDirectory. */
/**
 * THE BASE A CHECK IS READ AGAINST IS THE FORK POINT, AND THE PROMPT SAYS SO.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * The first real check `tools/the-inspector.mjs` ran, on 7 September 2026, was assembled against
 * c5f342ed. That commit is not an ancestor of the branch it was checking, whose head was 476dd5d1
 * and whose true fork point is 7009bd36. Measured in this repository:
 *
 *     git diff --name-only c5f342ed 476dd5d1   →  27 files
 *     git diff --name-only 7009bd36 476dd5d1   →  19 files
 *
 * The eight extra were other people's work — src/web/components/graph/Canvas.tsx, CardFace.tsx,
 * card.ts, cardhere.ts and three test files among them — and the inspector was asked to hold the
 * run to them. It noticed and said so in its refusal `FXxn0p80h_iQ`. Nothing in the tool did,
 * because the prompt carried the diff and never said where the diff had come from.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE HOLDS
 * ---------------------------------------------------------------------------------------
 *
 *   1. The base is the fork point and not the tip of the branch it was cut from, so work done on
 *      that branch AFTER the cut is not put to this run.
 *   2. The prompt says which base was used and how it was found, so the one reader who can catch a
 *      wrong base can see it rather than being asked to trust it.
 *   3. A base typed with --against is said to have been typed, and is never called a fork point.
 *   4. The branch the checkout was cut from comes off the run's own record where it says one.
 *   5. A base that cannot be found stops the check. `HEAD` used to be the quiet answer, and
 *      `git diff HEAD` is the uncommitted changes — a check of almost nothing that reads as a check
 *      of everything. A branch already merged is the same trap wearing the other face: the merge
 *      base is HEAD itself and the diff is empty, which is not a run that changed nothing.
 *
 * The tool is run for real, as a child process, against a throwaway git checkout and the real
 * server on a port of its own. `--dry` means no model runs and nothing is written.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT GOES RED WHEN THE CODE IS REMOVED. Control run first.
 * ---------------------------------------------------------------------------------------
 *
 *   - Make `theBase` return the branch tip rather than the merge base, and the first case goes red:
 *     the file committed on main after the cut appears in the run's changes.
 *   - Take `theBaseSays(input.base)` out of the prompt in src/server/lib/inspection.ts, and the
 *     second case goes red.
 *   - Have `theBase` call every base a fork point, and the third goes red.
 *   - Have the tool ignore `reads.checkout.cutFrom` and always use main, and the fourth goes red.
 *   - Put `catch { return 'HEAD' }` back, or drop the `base === head` stop, and the fifth goes red.
 */
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { spawn, execFileSync, type ChildProcess } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const INSPECTOR = join(REPO, 'tools', 'the-inspector.mjs')
const WORKSPACE = 'default'
const AS_THE_PERSON = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-workspace': WORKSPACE,
}
const asAgent = (id: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
  'x-mole-office-workspace': WORKSPACE,
})

/** The area the worker registered. Everything this checkout holds is inside it. */
const THE_AREA = ['work']

let t: TestDb
let app: FastifyInstance
let api = ''
let checkout = ''
/**
 * WHERE THE TOOL CUTS ITS CHECK WORKTREE FOR THIS TEST. Told through MOLE_OFFICE_CHECK_WORKTREES, as
 * tests/a-check-runs-in-a-worktree-of-its-own.test.ts tells it, and removed with the repository. Left
 * untold, the real tool cut its worktree under the SHARED folder, and once this test had deleted the
 * repository it was cut from, git could neither deregister nor remove it: two piled up on every run
 * of these two files, silently, because the uuid in the name defeats the tool's collision stop.
 * Problem ZsaOzNfR4leZ, 9 September 2026; measured at two leftovers per run before this line.
 */
let worktrees = ''
/** The tip of main after it moved on past the fork, so a test can ask for it by name. */
let mainMovedOn = ''

async function register(headers: Record<string, string>, payload: Record<string, unknown>): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload })
  expect(reply.statusCode, reply.body).toBe(201)
}

/** File a run that says its work is finished, with whatever its record should say about the checkout. */
async function fileARun(handle: string, title: string, checkoutSays: Record<string, unknown> = {}): Promise<string> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asAgent(handle),
    payload: {
      kind: 'session',
      title,
      data: { state: 'running', servingAgent: handle, workingDirectory: checkout, doing: 'building the thing under check', ...checkoutSays },
    },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  const id = (reply.json() as { record: { id: string } }).record.id
  // Explicit historical fixture: preserve the pre-seal fork-point contract.
  t.client.sqlite.prepare('INSERT INTO legacy_unsealed_runs VALUES (?)').run(id)
  t.api.patchRecord(id, { dataPatch: { state: 'finished' } }, { type: 'agent', id: handle })
  return id
}

/**
 * WHAT THE REAL SERVER ANSWERED THE REAL TOOL, whole, for each run.
 *
 * A hook copies the body of every reply to POST /api/checks/<run>/prompt. That is the production
 * route answering the production tool; nothing here is a stand-in.
 */
interface Assembled {
  prompt: string
  changes: { inside: { path: string; changes: string }[]; outside: string[]; says: string }
  base: { ref: string; how: string; says: string } | null
}
const answered = new Map<string, Assembled>()
const PROMPT_ROUTE = /^\/api\/checks\/([^/]+)\/prompt$/u

function whatTheServerAnswered(run: string): Assembled {
  const it = answered.get(run)
  if (it === undefined) throw new Error(`the server answered no prompt for run ${run}`)
  return it
}

/** Run the tool dry and hand back what it printed and how it ended. */
function inspectDry(run: string, flags: string[] = []): Promise<{ code: number | null; out: string; err: string }> {
  return new Promise((done) => {
    const child: ChildProcess = spawn(
      process.execPath,
      [
        INSPECTOR,
        '--run',
        run,
        '--as',
        'inspector-one',
        '--api',
        api,
        '--workspace',
        WORKSPACE,
        '--checkout',
        checkout,
        '--dry',
        ...flags,
      ],
      { cwd: REPO, env: { ...process.env, MOLE_OFFICE_CHECK_WORKTREES: worktrees }, stdio: ['ignore', 'pipe', 'pipe'] },
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

const git = (...argv: string[]): string =>
  execFileSync('git', argv, { cwd: checkout, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  app.addHook('onSend', (request, _reply, payload, done) => {
    const at = PROMPT_ROUTE.exec(request.url.split('?')[0] ?? '')
    if (at !== null && request.method === 'POST' && typeof payload === 'string') {
      answered.set(at[1] ?? '', JSON.parse(payload) as Assembled)
    }
    done(null, payload)
  })
  await app.ready()
  api = await app.listen({ port: 0, host: '127.0.0.1' })
  await register(AS_THE_PERSON, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })
  await register(AS_THE_PERSON, { handle: 'inspector-one', name: 'Inspector One', role: 'inspector' })
  await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'the-worker', name: 'The Worker', role: 'worker', workArea: THE_AREA })

  // ---------------------------------------------------------------------------------------
  // A CHECKOUT WITH A FORK IN IT, and both sides commit after the fork.
  //
  //   main:      before ── after-the-fork          `work/on-main.txt`
  //                 \
  //   the-work:      └── the-run's-own-commit      `work/the-run.txt`
  //
  // The run under check is `the-work`. Its own change is the-run.txt and nothing else. on-main.txt
  // is somebody else's work, done on main after the cut, and a check that puts it to this run is
  // the fault this file exists for.
  // ---------------------------------------------------------------------------------------
  checkout = mkdtempSync(join(tmpdir(), 'mole-office-a-checkout-with-a-fork-'))
  worktrees = mkdtempSync(join(tmpdir(), 'mole-office-check-worktrees-'))
  const quiet = (...argv: string[]): void => {
    execFileSync('git', argv, { cwd: checkout, stdio: 'ignore' })
  }
  quiet('init', '-q', '-b', 'main')
  quiet('config', 'user.email', 'a-test@example.invalid')
  quiet('config', 'user.name', 'A test')
  mkdirSync(join(checkout, 'work'))
  writeFileSync(join(checkout, 'work', 'before.txt'), 'What was there before anybody started.\n')
  quiet('add', '-A')
  quiet('commit', '-q', '-m', 'Before the work')

  quiet('checkout', '-q', '-b', 'the-work')
  writeFileSync(join(checkout, 'work', 'the-run.txt'), "What this run built, and the only thing it is answerable for.\n")
  quiet('add', '-A')
  quiet('commit', '-q', '-m', "The run's own commit")

  // MAIN MOVES ON AFTER THE FORK. This is what makes the tip and the fork point two different
  // commits, which is the whole measurement.
  quiet('checkout', '-q', 'main')
  writeFileSync(join(checkout, 'work', 'on-main.txt'), 'Somebody else, on main, after the cut.\n')
  quiet('add', '-A')
  quiet('commit', '-q', '-m', 'Somebody else, after the cut')
  mainMovedOn = git('rev-parse', 'HEAD')

  // A SECOND BRANCH THAT IS NOT CUT FROM MAIN, for the run whose record names what it was cut from.
  quiet('checkout', '-q', 'the-work')
  quiet('checkout', '-q', '-b', 'a-second-storey')
  writeFileSync(join(checkout, 'work', 'the-second-storey.txt'), 'Built on top of the-work, not on main.\n')
  quiet('add', '-A')
  quiet('commit', '-q', '-m', 'The second storey')

  quiet('checkout', '-q', 'the-work')
})

afterAll(async () => {
  await app.close()
  t.close()
  rmSync(checkout, { recursive: true, force: true })
  rmSync(worktrees, { recursive: true, force: true })
})

describe('the base a check is read against', () => {
  it("is the fork point, so work done on main after the cut is not put to this run", async () => {
    const run = await fileARun('the-worker', 'The run on the-work branch')
    const ran = await inspectDry(run)
    expect(ran.code, ran.err).toBe(0)

    const said = whatTheServerAnswered(run)
    const paths = said.changes.inside.map((one) => one.path).sort()
    // THE WHOLE POINT. `work/the-run.txt` is this run's own commit. `work/on-main.txt` was
    // committed on main AFTER the fork, and against the branch tip it would be in this list.
    expect(paths).toEqual(['work/the-run.txt'])
    expect(paths).not.toContain('work/on-main.txt')

    // And the base is the merge base, which is neither head.
    const forkPoint = execFileSync('git', ['merge-base', 'the-work', 'main'], { cwd: checkout, encoding: 'utf8' }).trim()
    expect(said.base?.ref).toBe(forkPoint)
    expect(said.base?.how).toBe('fork point')
    expect(said.base?.ref).not.toBe(mainMovedOn)
  })

  it('is written into the prompt, saying which commit it was and how it was found', async () => {
    const run = await fileARun('the-worker', 'The run whose prompt has to say its base')
    const ran = await inspectDry(run)
    expect(ran.code, ran.err).toBe(0)

    const said = whatTheServerAnswered(run)
    // THE PROMPT ITSELF, not only the reply beside it: the inspector reads the prompt and nothing else.
    expect(said.prompt).toContain('WHAT THESE CHANGES WERE READ AGAINST')
    expect(said.prompt).toContain(said.base?.ref ?? 'no base was answered')
    expect(said.prompt).toContain('the branch it was cut from')
    // And a person watching the terminal sees the same two facts.
    expect(ran.out).toContain('found as the fork point')
  })

  it('says a base was typed when --against said it, and never calls that a fork point', async () => {
    const run = await fileARun('the-worker', 'The run checked against a typed base')
    const ran = await inspectDry(run, ['--against', mainMovedOn])
    expect(ran.code, ran.err).toBe(0)

    const said = whatTheServerAnswered(run)
    expect(said.base?.ref).toBe(mainMovedOn)
    expect(said.base?.how).toBe('typed')
    expect(said.prompt).toContain('typed on the command line with --against')
    expect(said.prompt).toContain('may include work this run never did')
    expect(said.prompt).not.toContain('The base is the fork point')
    expect(ran.out).toContain('found as the typed')
  })

  it('reads the branch to fork from off the run\'s own record where it names one', async () => {
    // This run's work is `a-second-storey`, cut from `the-work` and not from main. Its record says
    // so, and the fork point is then the-work's head — so the-run.txt, which the-work committed, is
    // NOT this run's doing. Read against main, it would be.
    execFileSync('git', ['checkout', '-q', 'a-second-storey'], { cwd: checkout, stdio: 'ignore' })
    const run = await fileARun('the-worker', 'The run on the second storey', { cutFrom: 'the-work' })
    const ran = await inspectDry(run)
    execFileSync('git', ['checkout', '-q', 'the-work'], { cwd: checkout, stdio: 'ignore' })
    expect(ran.code, ran.err).toBe(0)

    const said = whatTheServerAnswered(run)
    const paths = said.changes.inside.map((one) => one.path).sort()
    expect(paths).toEqual(['work/the-second-storey.txt'])
    expect(paths).not.toContain('work/the-run.txt')
    expect(said.base?.how).toBe('fork point')
    expect(said.prompt).toContain('the-work')
  })

  it('stops when the branch is already merged, rather than reporting a run that changed nothing', async () => {
    // Merge the-work into main and check it from main. The merge base is then HEAD itself and the
    // diff is empty. An empty diff and "this run changed nothing" are different facts.
    execFileSync('git', ['checkout', '-q', 'main'], { cwd: checkout, stdio: 'ignore' })
    execFileSync('git', ['merge', '-q', '--no-edit', 'the-work'], { cwd: checkout, stdio: 'ignore' })
    const run = await fileARun('the-worker', 'The run whose branch is already merged')
    const ran = await inspectDry(run)
    execFileSync('git', ['checkout', '-q', 'the-work'], { cwd: checkout, stdio: 'ignore' })

    expect(ran.code).toBe(1)
    expect(ran.err).toContain('already contained in main')
    expect(ran.err).toContain('branch already merged, not a run that changed nothing')
    expect(ran.err).toContain('Nothing was assembled and nothing was written')
    // AND NOTHING WAS ASSEMBLED: the server was never asked for a prompt for this run.
    expect(answered.has(run)).toBe(false)
  })
})
