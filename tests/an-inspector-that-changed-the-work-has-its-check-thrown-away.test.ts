// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Each check has its own identity. Writes-nothing still means no verdict. Failed checks retain trees until this fixture tears down its exact paths. */
import { aFixtureSeatDoor, aMadeUpCheckSession, fixtureOfficeDatabase } from './inspector-tool-fixture.ts'
/** Eligibility fixture update: the old HTTP stand-in had no eligibility door. It now explicitly answers eligible so this test reaches its original subject. */
/**
 * AN INSPECTOR THAT CHANGED THE WORK IT WAS CHECKING HAS ITS CHECK THROWN AWAY.
 *
 * Criterion C22 of design/rules/ACCEPTANCE.md: *An inspector that fixes what it found fails the
 * check.* Measured by mutation: have the inspector write a fix and the check goes red.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS AND WHAT IT MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * The guard in `src/server/lib/inspection.ts` compares RECORDS: an inspector that changed a record
 * the run it is checking wrote is refused the check by name. On 7 September 2026 the first check
 * that ever ran to an answer showed that half is not enough. The inspector refused the release —
 * correctly, for a missing test — and then wrote the test, corrected the code and committed it,
 * because the runtime it was given can edit files. A commit is not a record, so nothing saw it.
 *
 * This is the other half, and it is in the tool because the tool is the process that can look at a
 * working tree: nothing under src/ may run git. The tool photographs the checkout before it starts
 * the model and again when it comes back, and a check whose inspector changed anything is not
 * posted at all.
 *
 * ---------------------------------------------------------------------------------------
 * HOW THE TOOL IS RUN HERE
 * ---------------------------------------------------------------------------------------
 *
 * WHAT THE TOOL WRITES BEFORE IT RUNS ANYTHING, since 7 September 2026. It keeps what one assembly
 * measured on the run — POST /api/checks/<run>/assembled — so a person reads the size, the chapters,
 * the files and the base in Mole Office rather than in a terminal. So the write list below is two
 * entries before the verdict rather than one. What this file holds is unchanged: the ONE ACT,
 * POST /api/checks/<run>, is absent from the two thrown-away checks and present in the control, and
 * the list is compared whole so a write nobody expected still fails here.
 *
 * The same two stand-ins `tests/a-check-stopped-by-the-clock-says-so-and-writes-nothing.test.ts`
 * builds, and for the same reasons: a small office in this test process that answers the two reads
 * and records every write, and a `claude` on PATH, labelled a stand-in in its own first line, that
 * runs no model. The checkout is a throwaway git repository this file makes, so nothing it does
 * reaches this one.
 *
 * ---------------------------------------------------------------------------------------
 * A CHECK THROWN AWAY STILL KEEPS WHAT ITS MODEL SPENT (U3, problem Ev1f_CZ6roye, 25 September 2026)
 * ---------------------------------------------------------------------------------------
 *
 * The tool used to print its usage line only when everything went well. A model that changed the
 * work, or that exited 1 with an `error_max_turns` envelope, had spent its tokens and left no line,
 * so the worker made no receipt. Three cases hold that. Each mutation ran after a green control,
 * and the file was put back byte for byte, with the sha256 checked:
 *   - the usage line printed below the checkout-moved exit again: the case about a model that
 *     changed the work goes red;
 *   - the envelope dropped from the host run's non-zero result: the out-of-turns case and the
 *     by-hand case go red;
 *   - no PATCH sent: the by-hand case goes red;
 *   - the PATCH sent even when the session's runtime is inspection-tool: the by-hand case goes red,
 *     because the worker stores that receipt and it must not be stored twice.
 */
import { spawn, execFileSync, type ChildProcess } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { inspectionUsageIn, inspectionUsageReceipt, claudeUsage } from '../src/config/usage.mjs'
import { theOwnersEffort } from '../src/config/model-efforts.mjs'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const INSPECTOR = join(REPO, 'tools', 'the-inspector.mjs')
const RUN = 'RunUnderCheck2'
/**
 * THE OFFICE HERE IS AN OLDER ONE: its run-models door gives no native selection, so the tool starts the check from the
 * compatibility list (src/config/launcher-model-compatibility.json). The model is one that list names, and the door
 * answers it at its start value, as such an office does. A model the list does not name is refused before anything starts.
 */
const THE_MODEL = 'claude-sonnet-5'

const fixtureTrees = new Set<string>()
// Problem h09tYuNl1nd9; Vv6h0HVryXOe: each file run owns its worktree base.
mkdirSync(join(REPO, '.logs'), { recursive: true })
const fixtureBase = mkdtempSync(join(REPO, '.logs', 'check-changed-worktrees-'))
let office: Server
let api = ''
let bin = ''
let checkout = ''
/** Every write the tool made to the office, by path. Whether the act was posted is the point. */
const writes: string[] = []
/** Every PATCH the tool sent, by path, with its body. A check run by hand stores its receipt this way. */
const patches: { path: string; body: unknown }[] = []
/** The check sessions this office holds, by id, with the runtime each was filed with. */
const sessions = new Map<string, string>()
/** Synthetic seals and read failures from this stand-in office; no authored run is changed. */
let sealed = false
let secondRead: 'same' | 'changed' | 'http-failure' | 'bad-json' | 'disconnect' = 'same'
let checkReads = 0
const checkTraffic: string[] = []

beforeEach(() => {
  sealed = false
  secondRead = 'same'
  checkReads = 0
  checkTraffic.length = 0
  writes.length = 0
})

/**
 * A CLAUDE CODE ENVELOPE FROM A RUN THAT SPENT TOKENS, as `claude -p --output-format json` prints it.
 * Made up by this test; no model ran. `subtype` and `is_error` are set per case.
 */
const SPENT = {
  type: 'result',
  duration_ms: 225050,
  num_turns: 30,
  session_id: '33333333-3333-3333-3333-333333333333',
  total_cost_usd: 0.67,
  usage: { input_tokens: 22, cache_creation_input_tokens: 91900, cache_read_input_tokens: 1052191, output_tokens: 9457 },
  modelUsage: { 'claude-sonnet-5': {} },
}

/** A verdict a stand-in prints, in the one shape the tool reads. */
const A_RELEASE = JSON.stringify({
  verdict: 'released',
  check: 'A check this test made up. No model ran.',
  chaptersRead: [],
})

afterEach(() => {
  // A failed check deliberately retains its tree under this run's fixtureBase until fixture teardown.
  for (const at of fixtureTrees) { try { execFileSync('git', ['-C', checkout, 'worktree', 'remove', '--force', at], { stdio: 'ignore' }) } catch { /* already removed */ } }
  fixtureTrees.clear()
})

beforeAll(async () => {
  office = createServer((request, reply) => {
    if (aFixtureSeatDoor(request, reply)) return
    const path = request.url ?? ''
    if (path === `/api/checks/${RUN}`) checkTraffic.push(request.method ?? '')
    if (request.method === 'POST') writes.push(path)
    if (request.method === 'PATCH') {
      let body = ''
      request.on('data', (d) => {
        body += String(d)
      })
      request.on('end', () => {
        patches.push({ path, body: JSON.parse(body) as unknown })
        reply.setHeader('content-type', 'application/json')
        reply.end('{}')
      })
      return
    }
    reply.setHeader('content-type', 'application/json')
    if (request.url?.endsWith('/eligibility')) {
      reply.end(JSON.stringify({ eligible: true, code: 'CHECK_ELIGIBLE' }))
      return
    }
    // THE CHECK'S OWN SESSION RECORD, which the tool reads to learn whether the worker stores its receipt.
    if (request.method === 'GET' && path.startsWith('/api/records/') && !path.includes('?')) {
      const id = decodeURIComponent(path.slice('/api/records/'.length))
      const runtime = sessions.get(id)
      if (runtime === undefined) {
        reply.statusCode = 404
        reply.end(JSON.stringify({ error: 'no such record' }))
      } else reply.end(JSON.stringify({ record: { id, kind: 'session', data: { runtime } } }))
      return
    }
    if (path.startsWith('/api/office/run-models/for/')) {
      reply.end(JSON.stringify({ runtime: 'claude-code', model: THE_MODEL, variant: theOwnersEffort(THE_MODEL) }))
      return
    }
    if (request.method === 'GET' && path === `/api/checks/${RUN}`) {
      checkReads += 1
      if (checkReads === 2 && secondRead === 'http-failure') {
        reply.statusCode = 503
        reply.end(JSON.stringify({ error: 'The stand-in office cannot read the seal.' }))
        return
      }
      if (checkReads === 2 && secondRead === 'bad-json') {
        reply.end('This stand-in response is not JSON.')
        return
      }
      if (checkReads === 2 && secondRead === 'disconnect') {
        request.socket.destroy()
        return
      }
      reply.end(JSON.stringify({
        title: 'A run this test made up', workArea: [], chaptersSays: 'none',
        ...(sealed ? { submission: {
          id: checkReads === 2 && secondRead === 'changed' ? 'synthetic-seal-new' : 'synthetic-seal-old',
          seal: {
            kind: 'git', hash: 'synthetic-seal-hash',
            git: {
              directory: checkout,
              commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: checkout, encoding: 'utf8' }).trim(),
              forkBase: execFileSync('git', ['rev-parse', 'main'], { cwd: checkout, encoding: 'utf8' }).trim(),
            },
          },
        } } : {}),
      }))
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
      reply.end(JSON.stringify({ verdict: 'released', toTheWorker: 'm-1', toTheStarter: 'm-2', group: null, stands: {} }))
    })
  })
  await new Promise<void>((ok) => {
    office.listen(0, '127.0.0.1', ok)
  })
  const at = office.address()
  if (at === null || typeof at === 'string') throw new Error('the office reported no port')
  api = `http://127.0.0.1:${String(at.port)}`
  bin = mkdtempSync(join(tmpdir(), 'mole-office-a-stand-in-claude-'))

  // A CHECKOUT OF ITS OWN, so nothing this file does reaches the one it runs from.
  checkout = mkdtempSync(join(tmpdir(), 'mole-office-a-checkout-under-check-'))
  const git = (...argv: string[]): void => {
    execFileSync('git', argv, { cwd: checkout, stdio: 'ignore' })
  }
  // A CHECKOUT SHAPED LIKE A REAL ONE: a base branch, and the work on a branch cut from it.
  //
  // It used to be one commit on whatever branch `git init` made, and the tool took it because a
  // merge base it could not find quietly became `HEAD`. That fallback is gone — a base that cannot
  // be found now stops the check and says so, because `git diff HEAD` is the uncommitted changes
  // and a check of almost nothing must not read as a check of everything. So this file gives the
  // checkout the fork point every real one has, which is also what it was always pretending to be.
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 'a-test@example.invalid')
  git('config', 'user.name', 'A test')
  writeFileSync(join(checkout, 'before.txt'), 'What was there before the work.\n')
  git('add', '-A')
  git('commit', '-q', '-m', 'Before the work')
  git('checkout', '-q', '-b', 'the-work')
  writeFileSync(join(checkout, 'the-work.txt'), 'What the worker built.\n')
  git('add', '-A')
  git('commit', '-q', '-m', 'The work under check')
})

describe('p-y9H17Q-baO — a check reads its seal again before the verdict (message lPumTERJkveW)', () => {
  // MUTATION: remove the second GET and its guard before the posted call; a verdict is then posted.
  it('posts no verdict and names both seals when the run was sealed again', async () => {
    sealed = true
    secondRead = 'changed'
    standInClaude(`cat >/dev/null; echo '{"result":${JSON.stringify(A_RELEASE)}}'`)
    const ran = await inspect()
    expect(writes).toEqual([`/api/checks/${RUN}/prompt`, `/api/checks/${RUN}/assembled`])
    expect(ran.code).toBe(1)
    expect(ran.err).toContain(`Run ${RUN} was sealed again while this check read it (it read seal synthetic-seal-old; the current seal is synthetic-seal-new), so no verdict was posted; check the current seal.\n`)
    expect(ran.err).toContain('The run stays inspecting. Its starter can ask again.\n')
    expect(ran.err).toContain('is kept because verdict delivery has not completed.')
    expect(checkTraffic).toEqual(['GET', 'GET'])
    expect(ran.out).not.toContain('The check answered:')
  })

  // MUTATION: remove the second GET and its guard; these failures then post a verdict on a guess.
  it.each(['http-failure', 'bad-json', 'disconnect'] as const)('posts no verdict and says why the second read failed (%s)', async (failure) => {
    sealed = true
    secondRead = failure
    standInClaude(`cat >/dev/null; echo '{"result":${JSON.stringify(A_RELEASE)}}'`)
    const ran = await inspect()
    expect(writes).toEqual([`/api/checks/${RUN}/prompt`, `/api/checks/${RUN}/assembled`])
    expect(ran.code).toBe(1)
    expect(ran.err).toContain(`Run ${RUN}'s current seal could not be read before the verdict:`)
    expect(ran.err).toContain('; no verdict was posted.\n')
    if (failure === 'http-failure') expect(ran.err).toContain('HTTP 503')
    if (failure === 'bad-json') expect(ran.err).toMatch(/JSON/)
    if (failure === 'disconnect') expect(ran.err).toContain('did not return a complete response')
    expect(ran.err).toContain('The run stays inspecting. Its starter can ask again.\n')
    expect(ran.err).toContain('is kept because verdict delivery has not completed.')
    expect(checkTraffic).toEqual(['GET', 'GET'])
    expect(ran.out).not.toContain('The check answered:')
  })

  // MUTATION: reject an unchanged seal too; this control then fails to post the verdict.
  it('posts the verdict just after reading the same seal again', async () => {
    sealed = true
    standInClaude(`cat >/dev/null; echo '{"result":${JSON.stringify(A_RELEASE)}}'`)
    const ran = await inspect()
    expect(ran.code, ran.err).toBe(0)
    expect(writes).toEqual([`/api/checks/${RUN}/prompt`, `/api/checks/${RUN}/assembled`, `/api/checks/${RUN}`])
    expect(checkTraffic).toEqual(['GET', 'GET', 'POST'])
    expect(ran.out).toContain('The check answered: released.')
  })
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
function inspect(checkId: string = aMadeUpCheckSession()): Promise<{ code: number | null; out: string; err: string }> {
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
        '--checkout',
        checkout,
        '--limit',
        '1',
        // THE STAND-IN claude IS ON THIS MACHINE'S PATH, so the model is run here: --on-the-host.
        '--on-the-host',
      ],
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

describe('C22 — an inspector that changed the work it was checking', () => {
  it('has its check thrown away when it left a new file behind', async () => {
    writes.length = 0
    standInClaude(`cat >/dev/null; printf 'a fix the inspector wrote\\n' > "${checkout}/the-fix.txt"; echo '{"result":${JSON.stringify(A_RELEASE)}}'`)
    const ran = await inspect()
    expect(ran.code).toBe(1)
    expect(ran.err).toContain('changed the work it was checking')
    expect(ran.err).toContain('the-fix.txt')
    expect(ran.err).toContain('no longer checking it')
    // THE WHOLE POINT: the act was never posted, so no release was written and no run was ended.
    expect(writes).toEqual([`/api/checks/${RUN}/prompt`, `/api/checks/${RUN}/assembled`])
    rmSync(join(checkout, 'the-fix.txt'), { force: true })
  })

  it('has its check thrown away when it committed', async () => {
    writes.length = 0
    standInClaude(
      `cat >/dev/null; printf 'more\\n' >> "${checkout}/the-work.txt"; ` +
        `git -C "${checkout}" commit -qam 'the inspector mending it'; ` +
        `echo '{"result":${JSON.stringify(A_RELEASE)}}'`,
    )
    const ran = await inspect()
    expect(ran.code).toBe(1)
    expect(ran.err).toContain('the commit moved from')
    expect(writes).toEqual([`/api/checks/${RUN}/prompt`, `/api/checks/${RUN}/assembled`])
  })

  it('prints the usage line of a model that changed the work, and still throws the check away', async () => {
    writes.length = 0
    patches.length = 0
    const envelope = { ...SPENT, subtype: 'success', is_error: false, result: A_RELEASE }
    writeFileSync(join(bin, 'envelope.json'), JSON.stringify(envelope))
    standInClaude(`cat >/dev/null; printf 'a fix the inspector wrote\\n' > "${checkout}/the-fix.txt"; cat "${bin}/envelope.json"`)
    const ran = await inspect()
    rmSync(join(checkout, 'the-fix.txt'), { force: true })
    expect(ran.code).toBe(1)
    expect(ran.err).toContain('changed the work it was checking')
    expect(writes).toEqual([`/api/checks/${RUN}/prompt`, `/api/checks/${RUN}/assembled`])
    // The worker receives the runtime and native output, from which it reads the same reported counts.
    expect(inspectionUsageIn(ran.out)).toEqual({ runtime: 'claude-code', output: JSON.stringify(envelope) })
    expect(inspectionUsageReceipt(inspectionUsageIn(ran.out)!)).toEqual(claudeUsage(JSON.stringify(envelope)))
  })

  it('prints the usage line of a model that ran out of turns and exited 1', async () => {
    writes.length = 0
    patches.length = 0
    const envelope = { ...SPENT, subtype: 'error_max_turns', is_error: true }
    writeFileSync(join(bin, 'envelope.json'), JSON.stringify(envelope))
    standInClaude(`cat >/dev/null; cat "${bin}/envelope.json"; exit 1`)
    const ran = await inspect()
    expect(ran.code).toBe(1)
    expect(ran.err).toContain('The check did not finish, so no verdict was written: claude exited 1.')
    expect(writes).toEqual([`/api/checks/${RUN}/prompt`, `/api/checks/${RUN}/assembled`])
    expect(inspectionUsageIn(ran.out)).toEqual({ runtime: 'claude-code', output: JSON.stringify(envelope) })
  })

  it('stores the receipt itself on a check run by hand, and not on a check the worker started', async () => {
    const envelope = { ...SPENT, subtype: 'error_max_turns', is_error: true }
    writeFileSync(join(bin, 'envelope.json'), JSON.stringify(envelope))
    standInClaude(`cat >/dev/null; cat "${bin}/envelope.json"; exit 1`)

    // BY HAND: the check's session was filed as a Claude Code session, so no worker reads the line.
    patches.length = 0
    const byHand = aMadeUpCheckSession()
    sessions.set(byHand, 'claude-code')
    const handRun = await inspect(byHand)
    expect(handRun.code).toBe(1)
    expect(patches).toEqual([{ path: `/api/records/${byHand}`, body: { dataPatch: { usageReceipt: claudeUsage(JSON.stringify(envelope)) } } }])
    expect(handRun.out).toContain(`The usage receipt is stored on this check's session ${byHand}.`)

    // BY THE WORKER: the worker files its check sessions as inspection-tool and stores the receipt
    // from the line, so the tool must not store it a second time.
    patches.length = 0
    const byTheWorker = aMadeUpCheckSession()
    sessions.set(byTheWorker, 'inspection-tool')
    const workerRun = await inspect(byTheWorker)
    expect(workerRun.code).toBe(1)
    expect(inspectionUsageIn(workerRun.out)).toEqual({ runtime: 'claude-code', output: JSON.stringify(envelope) })
    expect(patches).toEqual([])
    expect(workerRun.out).not.toContain('usage receipt')

    // NO SESSION RECORD AT ALL: a hand run given no --check. Nothing is stored, and the tool says why.
    patches.length = 0
    const noRecord = aMadeUpCheckSession()
    const bare = await inspect(noRecord)
    expect(patches).toEqual([])
    expect(bare.out).toContain(`No usage receipt was stored, because ${noRecord} is not a session record in panelx.`)
  })

  it('posts the act when the inspector changed nothing, which is the control', async () => {
    writes.length = 0
    standInClaude(`cat >/dev/null; echo '{"result":${JSON.stringify(A_RELEASE)}}'`)
    const ran = await inspect()
    expect(ran.code).toBe(0)
    expect(ran.err).not.toContain('changed the work')
    expect(writes).toEqual([`/api/checks/${RUN}/prompt`, `/api/checks/${RUN}/assembled`, `/api/checks/${RUN}`])
    expect(ran.out).toContain('The check answered: released.')
  })
})
