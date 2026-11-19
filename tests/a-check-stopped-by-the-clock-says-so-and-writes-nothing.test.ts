// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Each check has its own identity. Writes-nothing still means no verdict. Failed checks retain trees until this fixture tears down its exact paths. */
import { aFixtureSeatDoor, aMadeUpCheckSession, fixtureOfficeDatabase } from './inspector-tool-fixture.ts'
/** Eligibility fixture update: the old HTTP stand-in had no eligibility door. It now explicitly answers eligible so this test reaches its original subject. */
/**
 * A CHECK THAT RUNS OUT OF TIME SAYS SO, NAMES THE FLAG, AND WRITES NOTHING.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS MEASURED, AND WHAT THIS FILE HOLDS TO IT
 * ---------------------------------------------------------------------------------------
 *
 * On 7 September 2026 the first real check `tools/the-inspector.mjs` ran, a 171,420-byte prompt,
 * was still running at twenty minutes and was stopped by the tool's own clock. What the tool
 * printed was "claude exited 143", which is true and useless: 143 is the number a process gets
 * when SIGTERM ends it, and nothing said that the SIGTERM came from this tool. So the limit became
 * a flag, `--limit`, in minutes, and exit code 143 got its own sentence that says the check was
 * still running, how long it was given, and what to do about it.
 *
 * ---------------------------------------------------------------------------------------
 * HOW THE TOOL IS RUN HERE
 * ---------------------------------------------------------------------------------------
 *
 * The tool is run for real, as a child process, because it reads its flags at import and there is
 * no way to call `runClaude` on its own. It needs two things from outside, and this file supplies
 * both under its own control:
 *
 *   - A Mole Office to ask. The tool reads GET /api/checks/<run> and POST /api/checks/<run>/prompt
 *     before it runs a model, and POST /api/checks/<run> is the one write it ever makes. A small
 *     server in this test process answers the two reads and records every write, so "writes
 *     nothing" is a thing this file can see rather than assume.
 *   - A `claude` command on PATH. The real one costs a model call and takes minutes. The one here
 *     is a shell script written by this test, LABELLED AS A STAND-IN in its own first line, whose
 *     whole behaviour is to sleep past the limit or to exit with a number this file chooses.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT GOES RED WHEN THE CODE IS REMOVED
 * ---------------------------------------------------------------------------------------
 *
 *   - Point the tool at this repository instead of the checkout this file builds, and every case
 *     goes red the moment these commits reach main: that is the failure this file was fixed for,
 *     and the first case names it rather than reporting a clock it never reached.
 *   - Take the `--limit` branch out of readArguments, and the first test's run is given twenty
 *     minutes instead of a fraction of one; the test's own thirty-second budget ends it first.
 *   - Put `RUN_LIMIT_MS` back to the constant, and the same.
 *   - Stop `stoppedByTheClock` being set when the timer fires, and the sentence that names the
 *     limit is never said; the first test fails on it.
 *   - Say the sentence on `code === 143` as the first draft of this change did, and the third
 *     test fails, because a 143 somebody else caused is then called this tool's own doing.
 *   - Take the limit off the "Running the check" line, and the second test cannot see the default.
 *   - Have the tool post a verdict on the way out, and the last assertion of every test fails.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT "WRITES NOTHING" MEANS SINCE 7 SEPTEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * The tool now keeps what one assembly measured on the run — POST /api/checks/<run>/assembled — so
 * a person reads the size, the chapters, the files and the base in Mole Office rather than in the
 * terminal it was printed to. So a check that is stopped by the clock is no longer a run that wrote
 * literally nothing: it wrote what it WOULD have read, before it read it.
 *
 * The claim this file holds is unchanged and is checked more exactly than before: NO VERDICT IS
 * POSTED. The list of writes is still compared whole, so a third write appearing would fail here,
 * and POST /api/checks/<run> — the one act, the only door to a release — is never in it.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE CHECKOUT IS ITS OWN, AND IT WAS MEASURED ON MAIN
 * ---------------------------------------------------------------------------------------
 *
 * This file used to run the tool against THIS repository, with no `--checkout`, so what it tested
 * depended on where the branch it ran on happened to stand. That worked on a branch ahead of main
 * and broke the moment the same commits reached main: the tool works its base out as the fork point
 * of HEAD and the branch it was cut from, and on main HEAD IS that merge base, so the check stops
 * with *this checkout's HEAD is already contained in main* before a model is ever started. All four
 * cases failed, and none of them was about the base at all (log: .logs/rerun-code-3-red-1945.log).
 *
 * A TEST ABOUT THE CLOCK MUST NOT ASK WHERE ITS OWN BRANCH STANDS. So the tool is pointed at a
 * throwaway checkout this file builds — a base commit on `main`, a branch cut from it, one commit on
 * the branch — which is a fork point that exists whatever this repository is doing. It is the same
 * shape `tests/an-inspector-that-changed-the-work-has-its-check-thrown-away.test.ts` and
 * `tests/a-check-runs-in-a-worktree-of-its-own.test.ts` use, and for the same reason.
 *
 * EVERY ASSERTION ABOUT THE CLOCK AND THE EXIT CODES IS UNCHANGED. Only where the tool looks moved.
 */
import { spawn, execFileSync, type ChildProcess } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { theOwnersEffort } from '../src/config/model-efforts.mjs'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const INSPECTOR = join(REPO, 'tools', 'the-inspector.mjs')
const RUN = 'RunUnderCheck1'
/**
 * THE OFFICE HERE IS AN OLDER ONE: its run-models door gives no native selection, so the tool starts the check from the
 * compatibility list (src/config/launcher-model-compatibility.json). The model is one that list names, and the door
 * answers it at its start value, as such an office does. A model the list does not name is refused before anything starts.
 */
const THE_MODEL = 'claude-sonnet-5'

const fixtureTrees = new Set<string>()
// Problem h09tYuNl1nd9; the secretary's Vv6h0HVryXOe: each file run owns its worktree base.
mkdirSync(join(REPO, '.logs'), { recursive: true })
const fixtureBase = mkdtempSync(join(REPO, '.logs', 'check-clock-worktrees-'))
let office: Server
let api = ''
let bin = ''
/** A checkout of this file's own, with a fork point in it. See the header for why. */
let checkout = ''
/**
 * Every write the tool made to the office, by path. What it must NOT hold is the one act,
 * `/api/checks/<run>`, and the list is compared whole so an unexpected write fails here too.
 */
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
      reply.end(JSON.stringify({ title: 'A run this test made up', workArea: ['work'], chaptersSays: 'none' }))
      return
    }
    if (request.method === 'POST' && path === `/api/checks/${RUN}/prompt`) {
      request.resume()
      request.on('end', () => {
        reply.end(
          JSON.stringify({
            prompt: 'A prompt this test made up. It is not a real check.',
            bytes: 52,
            wholeCodeBytes: 0,
            chaptersAt: [],
            changes: { inside: [], outside: [] },
          }),
        )
      })
      return
    }
    request.resume()
    request.on('end', () => {
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

  // A CHECKOUT WITH A FORK POINT IN IT, so the tool has a base to find whatever this repository is
  // doing. `work` is the area the office answers with, so the one changed file is inside it.
  checkout = mkdtempSync(join(tmpdir(), 'mole-office-a-checkout-for-the-clock-'))
  const git = (...argv: string[]): void => {
    execFileSync('git', argv, { cwd: checkout, stdio: 'ignore' })
  }
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 'a-test@example.invalid')
  git('config', 'user.name', 'A test')
  mkdirSync(join(checkout, 'work'))
  writeFileSync(join(checkout, 'work', 'the-work.txt'), 'Before the work.\n')
  git('add', '-A')
  git('commit', '-q', '-m', 'Before the work')
  git('checkout', '-q', '-b', 'the-work')
  writeFileSync(join(checkout, 'work', 'the-work.txt'), 'Before the work.\nAnd what the run built.\n')
  git('commit', '-qam', 'The work under check')
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

/** Put a `claude` on PATH that does only what the body says. */
function standInClaude(body: string): void {
  const file = join(bin, 'claude')
  writeFileSync(file, `#!/bin/sh\n# A STAND-IN FOR THE claude COMMAND, written by a test. It runs no model.\n${body}\n`)
  chmodSync(file, 0o755)
}

/** Run the tool to its end and hand back what it printed and how it ended. */
function inspect(flags: string[]): Promise<{ code: number | null; out: string; err: string }> {
  const checkId = aMadeUpCheckSession()
  fixtureTrees.add(join(fixtureBase, 'a-check-of-' + RUN + '-' + checkId))
  return new Promise((done) => {
    const child: ChildProcess = spawn(
      process.execPath,
      [
        INSPECTOR,
        '--check', checkId,
        '--run',
        RUN,
        '--as',
        'inspector-of-nothing',
        '--api',
        api,
        '--workspace',
        'panelx',
        '--model',
        THE_MODEL,
        // THE CHECKOUT IS NAMED, so nothing here depends on where this repository's branch stands.
        '--checkout',
        checkout,
        // THE STAND-IN claude IS ON THIS MACHINE'S PATH, so the model is run here. The sandbox's own
        // clock is tests/the-inspector-builds-and-runs-its-model-in-a-sandbox.test.ts.
        '--on-the-host',
        ...flags,
      ],
      { cwd: REPO, env: { ...process.env, MOLE_OFFICE_DB: fixtureOfficeDatabase(fixtureBase), MOLE_OFFICE_CHECK_WORKTREES: fixtureBase, MOLE_OFFICE_INSPECTION_MINUTES: '40', PATH: `${bin}:${process.env.PATH ?? ''}` }, stdio: ['ignore', 'pipe', 'pipe'] },
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

describe('a check stopped by the clock', () => {
  it('is stopped after the minutes --limit gave it, says so, and writes nothing', async () => {
    writes.length = 0
    // The stand-in runs far longer than the limit, so only the tool's own clock can end it. It
    // becomes the sleep rather than waiting on one, so the SIGTERM the tool sends reaches the
    // process holding the pipes.
    standInClaude('cat >/dev/null; exec sleep 20')
    const ran = await inspect(['--limit', '0.01'])
    expect(ran.code).toBe(1)
    // AND IT REALLY REACHED THE MODEL. This is the assertion that would have named the failure on
    // main directly instead of leaving four cases red about a clock none of them had got to: a
    // check stopped by its BASE and a check stopped by its CLOCK both exit 1, and this file is only
    // about the second.
    expect(ran.err).not.toContain('already contained in main')
    expect(ran.out).toContain('found as the fork point')
    expect(ran.out).toContain('with 0.01 minutes to finish')
    expect(ran.err).toContain('The check was still running after 0.01 minutes and was stopped by this tool')
    expect(ran.err).toContain('nothing was written')
    expect(writes).not.toContain(`/api/checks/${RUN}`)
    expect(ran.err).toContain('--limit')
    expect(ran.err).not.toContain('claude exited')
    expect(ran.err).not.toContain('claude ended on signal')
    expect(writes).toEqual([`/api/checks/${RUN}/prompt`, `/api/checks/${RUN}/assembled`])
  })

  it('is given forty minutes when --limit is not said, and says so before it runs', async () => {
    writes.length = 0
    standInClaude('cat >/dev/null; exit 7')
    const ran = await inspect([])
    expect(ran.out).toContain('with 40 minutes to finish')
    expect(writes).toEqual([`/api/checks/${RUN}/prompt`, `/api/checks/${RUN}/assembled`])
  })

  it('does not call a run stopped by this tool when the number was 143 but the clock never fired', async () => {
    writes.length = 0
    // 143 is the number a shell reports for a process SIGTERM ended. Somebody else can send that
    // signal, and a check they ended is not a check this tool ended. The sentence that names this
    // tool is said only when its own clock fired.
    standInClaude('cat >/dev/null; exit 143')
    const ran = await inspect([])
    expect(ran.code).toBe(1)
    expect(ran.err).toContain('claude exited 143.')
    expect(ran.err).not.toContain('stopped by this tool')
    expect(writes).toEqual([`/api/checks/${RUN}/prompt`, `/api/checks/${RUN}/assembled`])
  })

  it('still says the number and the error channel for any other exit', async () => {
    writes.length = 0
    standInClaude('cat >/dev/null; echo "the stand-in refused to start" >&2; exit 7')
    const ran = await inspect(['--limit', '0.01'])
    expect(ran.code).toBe(1)
    expect(ran.err).toContain('claude exited 7. the stand-in refused to start')
    expect(ran.err).not.toContain('still running')
    expect(writes).toEqual([`/api/checks/${RUN}/prompt`, `/api/checks/${RUN}/assembled`])
  })
})
