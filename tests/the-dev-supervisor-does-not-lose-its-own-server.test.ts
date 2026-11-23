// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * THE DEV SUPERVISOR DOES NOT LOSE ITS OWN SERVER, AND SAYS SO WHEN IT CANNOT START ONE.
 *
 * ---------------------------------------------------------------------------------------
 * THE PROBLEM THIS HOLDS SHUT
 * ---------------------------------------------------------------------------------------
 *
 * Problem `5ZHmJ4_C26Y8`, measured on the owner's own stack on 4 September 2026 and reproduced on a
 * scratch one the same day. Read out of `.logs/dev-server-2026-09-04b.log`:
 *
 *   · 09:49:16 — TWO `restarting the server` lines a millisecond apart, both saying
 *     `src/server/lib/health.ts changed`. `restart` waited about two seconds for the child to stop,
 *     and a second restart started inside that wait. Two servers were spawned.
 *   · 09:49:18 — one of them took the configured port; the other died of `EADDRINUSE`, and ITS exit handler
 *     cleared the supervisor's only reference to the one that was up.
 *   · 09:49 to 10:36 — the supervisor believed it had no server and started a new one every thirty
 *     seconds. All ninety-six failed on the port the untracked child was holding. `GET /api/health`
 *     answered `ok: true` the whole time, and `GET /api/runtime` said the dev supervisor was
 *     watching this server and restarts it when its code changes. Both were false.
 *   · 10:26:30 — the merge `f1447b4` WAS seen: `restarting the server: src/config/settings.mjs
 *     changed, and 4 other files with it`. The watch had not been lost. The restart could not land,
 *     so the API served pre-merge code and the red banner stayed up.
 *   · The supervisor's group was then stopped and the child, which is in a group of its own,
 *     survived it. systemd adopted it, it kept the port, and the runtime record named systemd
 *     under `supervisor`.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS FIXED, AND WHERE EACH PART IS PROVED
 * ---------------------------------------------------------------------------------------
 *
 * 1. ONE RESTART AT A TIME, and only the current child's exit counts. The slow group's first act.
 * 2. THE CHILD GOES WITH THE SUPERVISOR, by group on every signal and by `--stop-with-pid` when
 *    there is no signal to catch. The slow group's second and third acts.
 * 3. A RUN OF FAILED STARTS REACHES A PERSON: a file, the runtime record, `GET /api/health`, the
 *    page's banner and the page that says Mole Office did not start. The fourth act and the fast
 *    group.
 * 4. A CHANGE NOBODY SAW IS FOUND BY A CLOCK, within a minute. The fifth act.
 * 5. A SUPERVISOR IS NAMED ONLY WHEN IT IS ONE, and of this checkout. The fast group.
 *
 * ---------------------------------------------------------------------------------------
 * THE CHILD IS MADE SLOW TO STOP ON PURPOSE, AND THAT IS A FIXTURE
 * ---------------------------------------------------------------------------------------
 *
 * The race in act 1 lives in the window between a restart deciding to happen and the new server
 * being spawned, and that window is as wide as the child takes to stop. On the owner's stack, with
 * a message worker and twelve hundred records, it was about two seconds and the race hit four times
 * in two hours. On a scratch copy it is NINETY MILLISECONDS — measured, 4 September 2026 — and the
 * race never hits.
 *
 * So the copy's server is given a SIGTERM handler that blocks for three seconds while a marker file
 * is there, and the act removes the marker afterwards. It is a fixture, it is written into the copy
 * and never into this checkout, and a server slow to stop is an ordinary thing rather than an
 * impossible one. Without it this act would pass on the broken code about nineteen times in twenty.
 *
 * ---------------------------------------------------------------------------------------
 * TWO MUTANTS PASS EVERYTHING HERE, AND THIS SAYS WHICH AND WHY THE LINES STAY
 * ---------------------------------------------------------------------------------------
 *
 * Measured 4 September 2026, each mutant run alone against this whole file.
 *
 * 1. DELETING `if (started !== child) return` FROM THE CHILD'S EXIT HANDLER PASSES. That line is
 *    what stopped an abandoned child's exit from clearing the reference to the server that is up,
 *    and it was the second half of what turned one lost race into ninety-six failed starts. With
 *    one restart at a time there is no second child to abandon by that route, so nothing here
 *    notices. g_icMYOZxkQZ, wave 13t, closes the timeout route: `stopTheChild` now keeps
 *    a child that outlives both waits. The stand-in case below suppresses SIGKILL for its recorded
 *    group to drive that state without pretending a kernel-stuck process was made. The line
 *    is the exit handler's correctness condition rather than a second lock: an exit event is about
 *    one process, and acting on it as though it were about another is what went wrong.
 *
 * 2. MAKING `stop` NOT STOP THE CHILD PASSES, because the child also ends itself when the process
 *    named by `--stop-with-pid` is gone, and the third act allows fifteen seconds. The two are for
 *    different situations — the group stop is immediate and happens before the ledger row is
 *    written, the parent-death watch is for `kill -KILL`, where no handler runs at all — so both
 *    stay. Deleting BOTH is red: the child outlives the supervisor and keeps the port, which is
 *    what happened on 4 September 2026.
 */

import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import {
  aChangeNobodySaw,
  A_GOOD_RUN_LASTS,
  THE_LONGEST_BACKOFF,
  HOW_OFTEN_TO_LOOK_FOR_THE_SERVICE_LOCK,
  A_CHILD_HAS_TO_STOP_WITHIN,
  A_SERVER_HAS_TO_STOP_WITHIN,
  HOW_OFTEN_TO_LOOK_FOR_THE_MIGRATION,
  theBackoffAfter,
  theFailedStartsBeforeSaying,
  theOrphanOnThePort,
  theSlowCheckEvery,
  serveDev,
  stopTheOrphan,
} from '../tools/serve-dev.mjs'
import { aWatchOnTheStarter } from '../src/config/session-process.mjs'
import {
  THE_TROUBLE_ADDRESS,
  THE_TROUBLE_IS_STALE_AFTER,
  theRefusalFileIn,
  readTheTrouble,
  theTroubleFileIn,
  theTroubleStillStands,
  whatTheTroubleSays,
  writeTheTrouble,
} from '../src/config/supervisor-trouble.mjs'
import { serviceLockPathFrom, settingNamed } from '../src/config/settings.mjs'
import {
  THE_SERVICE_LOCK_REFUSAL_EXIT_CODE,
  takeTheServiceLock,
  theLockIsHeldSentence,
  theProcessReading,
} from '../src/config/the-service-lock.mjs'
import { THE_GUARD_REFUSALS_BEGIN } from '../src/config/guard-refusal.mjs'
import { compareThisPageWith, forgetTheWorldOnThisPage, type RuntimeFactsForThePage } from '../src/web/lib/world.ts'
import { commandThatStopsWithItsOwner, freshDb, type TestDb } from './helpers.ts'
import { createServer as aViteDevServer, type ViteDevServer } from 'vite'
import type { RuntimeRecord, SupervisorFailedStarts } from '../src/shared/runtime.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms))
const THE_TEST_CLOCKS = { goodRun: 250, migrationLook: 200, serviceLockLook: 200 }
const A_SHORT_CHILD_STOP = 200
/** The port the failed starts were on: the product's default, as src/config/settings.mjs declares it. */
const THE_PORT = Number(settingNamed('MOLE_OFFICE_PORT').fallback)

/** One run of failed starts, as the supervisor writes it down. */
function aRunOfFailures(over: Partial<Parameters<typeof writeTheTrouble>[1]> = {}): Parameters<typeof writeTheTrouble>[1] {
  return {
    atMs: Date.now(),
    sinceMs: Date.now() - 47 * 60 * 1000,
    failedStarts: 96,
    lastExit: 'exit code 1',
    lastOutput: [`Error: listen EADDRINUSE: address already in use 127.0.0.1:${String(THE_PORT)}`],
    supervisorPid: 845844,
    supervisorPgid: 845844,
    repository: `${THE_TEST_FIXTURE_ROOT}/test_claude/panelx`,
    port: THE_PORT,
    ...over,
  }
}

// ================================================================ a change nobody saw, decided

describe('a change nobody saw is decided by comparing the disk with the running server', () => {
  const startedAt = new Date('2026-09-04T10:26:00').getTime()

  it('says nothing when the newest file is older than the server that loaded it', () => {
    expect(aChangeNobodySaw({ at: new Date('2026-09-04T10:25:00'), file: 'src/shared/messages.ts' }, startedAt)).toBeNull()
  })

  it('names the file when it is newer than the server, in the words the restart reason uses', () => {
    expect(aChangeNobodySaw({ at: new Date('2026-09-04T10:26:29'), file: 'src/shared/messages.ts' }, startedAt)).toBe(
      'a change nobody saw: src/shared/messages.ts',
    )
  })

  it('says nothing when the same second is the answer, because that file was loaded', () => {
    expect(aChangeNobodySaw({ at: new Date(startedAt), file: 'src/shared/messages.ts' }, startedAt)).toBeNull()
  })

  it('says nothing rather than guessing when there is no newest file to read', () => {
    expect(aChangeNobodySaw(null, startedAt)).toBeNull()
  })
})

describe('the two settings the supervisor reads', () => {
  it('checks for a missed change every minute unless somebody says otherwise', () => {
    expect(theSlowCheckEvery()).toEqual({ every: 60_000 })
    expect(A_GOOD_RUN_LASTS).toBe(10_000)
    expect(THE_LONGEST_BACKOFF).toBe(30_000)
    expect(A_CHILD_HAS_TO_STOP_WITHIN).toBe(5_000)
    expect(A_SERVER_HAS_TO_STOP_WITHIN).toBe(45_000)
    expect(HOW_OFTEN_TO_LOOK_FOR_THE_MIGRATION).toBe(5_000)
    expect(HOW_OFTEN_TO_LOOK_FOR_THE_SERVICE_LOCK).toBe(5_000)
  })

  it('writes a run of failed starts down after three of them', async () => {
    expect(theFailedStartsBeforeSaying()).toBe(3)
    const setting = 'MOLE_OFFICE_TEST_SUPERVISOR_CLOCKS'
    try {
      for (const raw of ['{', '[]', 'null', '{"unknown":1}', '{"goodRun":0}', '{"goodRun":-1}', '{"goodRun":1.5}', '{"goodRun":"1"}']) {
        vi.stubEnv(setting, raw)
        await expect(serveDev({ writeItDown: false })).rejects.toThrow(setting)
      }
    } finally {
      vi.unstubAllEnvs()
    }
  }, 30_000)
})

// ============================================================ a port held by this checkout's orphan

/**
 * WHAT MAY BE STOPPED, AND WHAT MAY NOT.
 *
 * The answer to F1 of design/ground/ACCEPTANCE.md is *named only*: the product never stops a
 * process it did not start. Every refusal below is one of the six things that has to be true.
 */
describe('a port held by a server this checkout’s own supervisor left behind', () => {
  const here = `${THE_TEST_FIXTURE_ROOT}/px-ground-10`
  const orphan = (over: Record<string, unknown> = {}): unknown => ({
    process: { pid: 1449170, pgid: 1449170 },
    repository: { path: here },
    supervisor: { watching: false },
    ...over,
  })
  const owned = [
    {
      type: 'process',
      key: '1449170',
      releasedAt: null,
      detail: `the Mole Office API on port ${String(THE_PORT)} — node --import tsx src/server/index.ts --stop-with-pid=845844`,
      liveness: { state: 'alive', detail: 'pid 1449170 — node --import tsx src/server/index.ts --stop-with-pid=845844' },
    },
  ]
  const gone = (): boolean => false
  const stillThere = (): boolean => true

  it('takes it over when the ledger says a supervisor started it and that supervisor is gone', () => {
    const answer = theOrphanOnThePort(orphan(), owned, here, gone)
    expect(answer).toHaveProperty('takeOver')
    expect('takeOver' in answer ? answer.takeOver : null).toEqual({ pid: 1449170, pgid: 1449170 })
    expect('why' in answer ? answer.why : '').toContain('845844')
  })

  it('refuses one serving another checkout', () => {
    const answer = theOrphanOnThePort(orphan({ repository: { path: `${THE_TEST_FIXTURE_ROOT}/px-elsewhere` } }), owned, here, gone)
    expect('no' in answer ? answer.no : '').toContain(`${THE_TEST_FIXTURE_ROOT}/px-elsewhere`)
  })

  it('refuses one something is still watching', () => {
    const answer = theOrphanOnThePort(orphan({ supervisor: { watching: true } }), owned, here, gone)
    expect('no' in answer ? answer.no : '').toContain('watching it')
  })

  it('refuses one that did not say which process group it is in', () => {
    const answer = theOrphanOnThePort(orphan({ process: { pid: 1449170, pgid: null } }), owned, here, gone)
    expect('no' in answer ? answer.no : '').toContain('process group')
  })

  it('refuses one no ledger row owns, which is F1 and the whole of it', () => {
    const answer = theOrphanOnThePort(orphan(), [], here, gone)
    expect('no' in answer ? answer.no : '').toContain('did not start it does not stop')
  })

  it('refuses one whose ledger row does not say a supervisor started it', () => {
    const byHand = [{ ...owned[0], detail: 'a server somebody started', liveness: { state: 'alive', detail: 'node x' } }]
    const answer = theOrphanOnThePort(orphan(), byHand, here, gone)
    expect('no' in answer ? answer.no : '').toContain('does not say a supervisor started it')
  })

  it('refuses one whose supervisor is still running, which is one supervisor per port', () => {
    const answer = theOrphanOnThePort(orphan(), owned, here, stillThere)
    expect('no' in answer ? answer.no : '').toContain('still running')
  })

  it('refuses a released row, because a row that has been let go owns nothing', () => {
    const released = [{ ...owned[0], releasedAt: '2026-09-04 10:40:00' }]
    const answer = theOrphanOnThePort(orphan(), released, here, gone)
    expect('no' in answer ? answer.no : '').toContain('did not start it does not stop')
  })
})

// =========================================================== exit, rather than a quiet port

/** A bounded wait for a stand-in's observable state, with the last output in the failure. */
async function untilStandIn(check: () => boolean, says: () => string, within = 15_000): Promise<void> {
  const until = Date.now() + within
  while (Date.now() < until) {
    if (check()) return
    await sleep(50)
  }
  throw new Error(`the stand-in did not reach the expected state: ${says()}`)
}

/** Stand-in HTTP listener; its SIGTERM closes the port before releasing its keep-alive timer, and it ends with its starter. */
function standInSource(port: number, linger: number | null): string {
  return `
    import { createServer } from 'node:http'
    import { appendFileSync } from 'node:fs'
    import { aWatchOnTheStarter } from ${JSON.stringify(join(REPO, 'src/config/session-process.mjs'))}
    const alive = setInterval(() => {}, 1000)
    // IT STOPS WITH THE PROCESS THAT STARTED IT, as the real server does (problem 26r01Ohh-DqX): a stand-in that
    // ignored --stop-with-pid outlived its test run by days when the run was ended from outside, where no cleanup runs.
    const named = process.argv.find((one) => one.startsWith('--stop-with-pid='))
    if (named !== undefined) {
      const theStarter = aWatchOnTheStarter(Number(named.slice('--stop-with-pid='.length)))
      setInterval(() => { if (theStarter().state === 'gone') process.exit(0) }, 250).unref()
    }
    const server = createServer((_req, res) => {
      res.setHeader('content-type', 'application/json')
      res.end('{}')
    })
    // ON THE SOCKET SERVE-DEV HOLDS, as src/server/index.ts listens (problem xGeC_iM6jxYl).
    const where = process.env.MOLE_OFFICE_LISTEN_FD ? { fd: Number(process.env.MOLE_OFFICE_LISTEN_FD) } : { port: ${port}, host: '127.0.0.1' }
    server.listen(where, () => {
      appendFileSync('.starts', String(process.pid) + '\\n')
      console.log('stand-in ready')
    })
    process.on('SIGTERM', () => {
      server.close(() => {
        console.log('stand-in port closed')
        ${linger === null ? '' : `setTimeout(() => { clearInterval(alive); process.exit(0) }, ${linger})`}
      })
      // A port probe can have connected just before SIGTERM. Its socket must not hold this
      // fixture's close callback past the supervisor's five-second shutdown wait.
      server.closeAllConnections()
    })
  `
}

/**
 * SERVE-DEV LOADED AGAIN, WITH THE SERVER'S OWN STOP LIMIT SHORTENED (SHUTDOWN_LIMIT_MS in src/config/settings.mjs).
 * A_SERVER_HAS_TO_STOP_WITHIN is that limit and 5 s, so it is 45 s in the product, and a case that waits it out
 * spends 45 s doing nothing. The constant is the one fact; this case chooses its value for a fresh copy of
 * serve-dev and of everything it imports, and every sentence it compares is built from that copy's constants.
 * Nothing loaded before this call changes. The caller checks the copy took the value, so a mock that did not
 * take fails rather than quietly waiting 45 s.
 */
async function serveDevWithTheStopLimit(limitMs: number): Promise<typeof import('../tools/serve-dev.mjs')> {
  vi.resetModules()
  vi.doMock('../src/config/settings.mjs', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../src/config/settings.mjs')>()),
    SHUTDOWN_LIMIT_MS: limitMs,
  }))
  try {
    return await import('../tools/serve-dev.mjs')
  } finally {
    vi.doUnmock('../src/config/settings.mjs')
  }
}

/** THE STOP LIMIT THE FIRST CASE BELOW GIVES ITS SERVER: above zero, so the drain's second wait still runs. */
const A_SHORT_STOP_LIMIT = 1_000

async function standInCheckout(linger: number | null): Promise<{ root: string; port: number; entry: string }> {
  const root = mkdtempSync(join(tmpdir(), 'mole-office-exit-stand-in-'))
  const port = await freePort()
  mkdirSync(join(root, 'src/server'), { recursive: true })
  mkdirSync(join(root, 'src/worker'), { recursive: true })
  writeFileSync(join(root, 'package.json'), '{"type":"module"}')
  symlinkSync(join(REPO, 'node_modules'), join(root, 'node_modules'))
  const entry = join(root, 'src/server/index.ts')
  writeFileSync(entry, standInSource(port, linger))
  writeFileSync(join(root, 'src/worker/index.ts'), '// stand-in worker entry\n')
  return { root, port, entry }
}

describe('shutdown waits for exit because wave 13t’s service lock is released last', () => {
  /**
   * MUTATION: restore today's unconditional child = null after the SIGKILL wait, returning true.
   * This case goes red: a second stand-in starts while the first is still alive.
   * SIGKILL cannot be delayed in user space. Suppress only that signal to this test's recorded
   * group; the real child, its port closure, the waits, watcher, failure record and backoff run.
   */
  it('keeps a child alive past both waits, records the failed restarts, and starts again after exit', async () => {
    const short = await serveDevWithTheStopLimit(A_SHORT_STOP_LIMIT)
    const clocks = { ...THE_TEST_CLOCKS, childStop: A_SHORT_CHILD_STOP, serverStop: A_SHORT_STOP_LIMIT + A_SHORT_CHILD_STOP, firstBackoff: 100, longestBackoff: 400 }
    // The copy waits A_SHORT_STOP_LIMIT and 5 s, and that is still longer than one child's wait, so the drain runs.
    expect(short.A_SERVER_HAS_TO_STOP_WITHIN).toBe(A_SHORT_STOP_LIMIT + short.A_CHILD_HAS_TO_STOP_WITHIN)
    expect(short.A_SERVER_HAS_TO_STOP_WITHIN).toBeGreaterThan(short.A_CHILD_HAS_TO_STOP_WITHIN)
    const fixture = await standInCheckout(null)
    const starts = (): number[] => existsSync(join(fixture.root, '.starts'))
      ? readFileSync(join(fixture.root, '.starts'), 'utf8').trim().split('\n').map(Number) : []
    const lines: string[] = []
    const realKill = process.kill.bind(process)
    let owner: Awaited<ReturnType<typeof short.serveDev>> | null = null
    let first = 0
    const kill = vi.spyOn(process, 'kill').mockImplementation((pid, signal) => {
      if (pid === -first && signal === 'SIGKILL') return true
      return realKill(pid, signal)
    })
    vi.stubEnv('MOLE_OFFICE_PORT', String(fixture.port))
    vi.stubEnv('MOLE_OFFICE_CHECK_FOR_MISSED_CHANGES', '0')
    try {
      owner = await short.serveDev({ clocks, root: fixture.root, writeItDown: false, say: (line) => lines.push(line) })
      await untilStandIn(() => starts().length === 1, () => lines.join('\n'))
      first = starts()[0] ?? 0
      appendFileSync(fixture.entry, '\n// request a restart\n')
      await untilStandIn(() => lines.some((line) => line.includes('no replacement was started')) || starts().length > 1,
        () => lines.join('\n'), clocks.serverStop + 15_000)
      expect(starts(), 'a replacement started beside the live old child').toEqual([first])
      expect(realKill(first, 0)).toBe(true)
      // The child has closed its listener, and the port is still not free: serve-dev holds the socket
      // across restarts (problem xGeC_iM6jxYl), so a quiet listener never frees the port.
      expect(await freePortIsTheSameAs(fixture.port)).toBe(false)
      // The first stop gives the server its drain; a backoff’s later try uses the shorter child wait.
      expect(lines).toContain(`[dev] the server in group ${first} is still alive after ${String((clocks.serverStop + clocks.childStop) / 1000)}s; no replacement was started.`)
      expect(owner.restartsSoFar()).toBe(0)
      await untilStandIn(() => readTheTrouble(fixture.root) !== null, () => lines.join('\n'), 30_000)
      const trouble = readTheTrouble(fixture.root)
      expect(trouble?.failedStarts).toBe(3)
      expect(trouble?.lastExit).toBe(`the server in group ${first} is still alive after ${String(2 * clocks.childStop / 1000)}s`)
      expect(starts()).toEqual([first])
      // Make the late exit happen during backoff, without a second file change.
      realKill(-first, 'SIGKILL')
      await untilStandIn(() => starts().length === 2, () => lines.join('\n'))
      expect(owner.restartsSoFar()).toBe(1)
      expect(isRunning(first)).toBe(false)
    } finally {
      kill.mockRestore()
      for (const pid of starts()) {
        try { realKill(-pid, 'SIGKILL') } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== 'ESRCH') throw err
        }
      }
      await owner?.stop()
      vi.unstubAllEnvs()
      rmSync(fixture.root, { recursive: true, force: true })
    }
  }, A_SERVER_HAS_TO_STOP_WITHIN + 90_000)

  /** Plain case: the existing SIGTERM exit still permits the next start. */
  it('restarts a child that exits on SIGTERM', async () => {
    const fixture = await standInCheckout(0)
    const starts = (): number[] => existsSync(join(fixture.root, '.starts'))
      ? readFileSync(join(fixture.root, '.starts'), 'utf8').trim().split('\n').map(Number) : []
    const lines: string[] = []
    let owner: Awaited<ReturnType<typeof serveDev>> | null = null
    vi.stubEnv('MOLE_OFFICE_PORT', String(fixture.port))
    vi.stubEnv('MOLE_OFFICE_CHECK_FOR_MISSED_CHANGES', '0')
    try {
      owner = await serveDev({ root: fixture.root, writeItDown: false, say: (line) => lines.push(line) })
      await untilStandIn(() => starts().length === 1, () => lines.join('\n'))
      appendFileSync(fixture.entry, '\n// ordinary restart\n')
      await untilStandIn(() => starts().length === 2, () => lines.join('\n'))
      expect(isRunning(starts()[0] ?? 0)).toBe(false)
      expect(owner.restartsSoFar()).toBe(1)
      expect(lines.join('\n')).not.toContain('no replacement was started')
    } finally {
      await owner?.stop()
      // EVERY STAND-IN IT STARTED IS STOPPED BY ITS GROUP, whatever the supervisor's stop did (problem 26r01Ohh-DqX).
      for (const pid of starts()) {
        try { process.kill(-pid, 'SIGKILL') } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== 'ESRCH') throw err
        }
      }
      vi.unstubAllEnvs()
      rmSync(fixture.root, { recursive: true, force: true })
    }
  })

  /**
   * MUTATION: omit the group probe from stopTheOrphan's quiet-port check.
   * This case also goes red: it accepts a quiet port instead of refusing a surviving group.
   * EPERM on a group probe means present. SIGKILL is suppressed only for this stand-in's group.
   */
  it('refuses an orphan group still present after SIGKILL, including EPERM on the group probe', async () => {
    const fixture = await standInCheckout(null)
    const started = spawn(process.execPath, ['--import', 'tsx', fixture.entry, `--stop-with-pid=${String(process.pid)}`], {
      cwd: fixture.root, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
    })
    const pgid = started.pid
    if (pgid === undefined) throw new Error('the stand-in did not start')
    let output = ''
    started.stdout?.on('data', (chunk: Buffer) => { output += chunk.toString() })
    started.stderr?.on('data', (chunk: Buffer) => { output += chunk.toString() })
    const gone = new Promise<void>((done) => started.once('close', () => done()))
    const realKill = process.kill.bind(process)
    const kill = vi.spyOn(process, 'kill').mockImplementation((pid, signal) => {
      if (pid === -pgid && signal === 'SIGKILL') return true
      if (pid === -pgid && signal === 0) throw Object.assign(new Error('fixture: group is present'), { code: 'EPERM' })
      return realKill(pid, signal)
    })
    try {
      await untilStandIn(() => output.includes('stand-in ready'), () => output)
      const lines: string[] = []
      await expect(stopTheOrphan(pgid, `http://127.0.0.1:${fixture.port}`, (line) => lines.push(line), A_SHORT_CHILD_STOP)).rejects.toThrow(
        `Process group ${pgid} is still there after ${String(2 * A_SHORT_CHILD_STOP / 1000)}s, so this supervisor did not start and has changed nothing.`,
      )
      expect(realKill(-pgid, 0)).toBe(true)
      expect(await freePortIsTheSameAs(fixture.port)).toBe(true)
      expect(lines).toContain(`[dev] the orphan in group ${pgid} did not stop within ${String(A_SHORT_CHILD_STOP / 1000)}s; killing it.`)
    } finally {
      kill.mockRestore()
      try { realKill(-pgid, 'SIGKILL') } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ESRCH') throw err
      }
      await gone
      rmSync(fixture.root, { recursive: true, force: true })
    }
  })

  /**
   * MUTATION: stopTheOrphan returns as soon as the port is quiet, omitting the group probe.
   * The lingering case goes red because SIGTERM closed the port but the group is still there.
   * The immediate case preserves the plain shutdown. Every process belongs to its own recorded
   * detached group and is reaped by this test; no real office is started.
   */
  it.each([1000, 0])('waits for an orphan group whose port closes %i ms before exit', async (linger) => {
    const fixture = await standInCheckout(linger)
    const started = spawn(process.execPath, ['--import', 'tsx', fixture.entry, `--stop-with-pid=${String(process.pid)}`], {
      cwd: fixture.root, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
    })
    const pgid = started.pid
    if (pgid === undefined) throw new Error('the stand-in did not start')
    let output = ''
    started.stdout?.on('data', (chunk: Buffer) => { output += chunk.toString() })
    started.stderr?.on('data', (chunk: Buffer) => { output += chunk.toString() })
    const gone = new Promise<void>((done) => started.once('close', () => done()))
    try {
      await untilStandIn(() => output.includes('stand-in ready'), () => output)
      const lines: string[] = []
      await stopTheOrphan(pgid, `http://127.0.0.1:${fixture.port}`, (line) => lines.push(line))
      expect(() => process.kill(-pgid, 0), 'the orphan group outlived stopTheOrphan').toThrow()
      // vwYtF1IMeOdi: exit and the group probe can precede the stdout pipe's last data.
      // Keep the group assertion above this wait, so it still catches an early orphan return.
      await gone
      expect(output).toContain('stand-in port closed')
      expect(await freePortIsTheSameAs(fixture.port)).toBe(true)
      expect(lines).toContain(`[dev] the orphan in group ${pgid} has stopped and the port is free.`)
    } finally {
      try { process.kill(-pgid, 'SIGKILL') } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ESRCH') throw err
      }
      await gone
      rmSync(fixture.root, { recursive: true, force: true })
    }
  })
})

// ========================================================= a watch on the process that started it

describe('a watch on the starter knows a pid given out again (problem 26r01Ohh-DqX)', () => {
  /** A process as the reader reads it, started at `second` seconds past a fixed moment. */
  const read = (second: number, state = 'S') => ({ here: true as const, pid: 4321, ppid: 1, pgid: 4321, state, startedAt: new Date(Date.UTC(2026, 9, 5, 12, 0, second)) })
  /** A reader that answers each read in turn, then the last answer again. */
  function reader(...answers: unknown[]): { processAt: () => any } {
    let at = 0
    return { processAt: () => answers[Math.min(at++, answers.length - 1)] }
  }
  // Mutations, each alone: compare the pid only; take a zombie for the starter (in theProcessAt); call a start that
  // cannot be read gone. Each turns one case red.
  it.each([
    ['the same process', 'there', [read(1), read(1)]],
    ['the pid given to a process that started later', 'gone', [read(1), read(9)]],
    ['nothing under the pid', 'gone', [read(1), { here: false }]],
    ['the starter ended and not yet collected (a zombie)', 'gone', [read(1), read(1, 'Z')]],
    ['a pid that was free when the watch began, taken since', 'gone', [{ here: false }, read(9)]],
    ['a process whose start cannot be read, answered by its pid as before', 'there', [{ here: true, unreadable: 'fixture' }, read(9)]],
  ] as const)('%s reads as %s', (_what, expected, answers) => {
    const watch = aWatchOnTheStarter(4321, reader(...answers))
    expect(watch().state).toBe(expected)
  })

  /** A reader that cannot look at all, as the macOS reader is when ps cannot run, from the given reading on. */
  function aReaderThatFails(from: number): { processAt: () => any } {
    let at = 0
    return {
      processAt: () => {
        at += 1
        if (at >= from) throw new Error('fixture: ps could not be run')
        return read(1)
      },
    }
  }
  // THE INSPECTOR'S REFUSAL OF RUN amHwZR-VRQR8: the server took the first reading outside its catch, and the worker read
  // the watch outside its loop's try, so a reader that could not look stopped the server's start or ended the worker.
  // Mutations, each alone: the first reading throws; a later reading throws.
  it('answers a reader that cannot look at its first reading as unreadable, never as gone, and does not throw it', () => {
    const watch = aWatchOnTheStarter(4321, aReaderThatFails(1))
    expect(watch()).toEqual({ state: 'unreadable', why: 'fixture: ps could not be run' })
  })
  it('answers a reader that cannot look on a later pass as unreadable, never as gone, and does not throw it', () => {
    const watch = aWatchOnTheStarter(4321, aReaderThatFails(2))
    expect(watch()).toEqual({ state: 'unreadable', why: 'fixture: ps could not be run' })
  })

  /**
   * THE STAND-IN THAT WAS LEFT RUNNING FOR DAYS, AS IT RUNS NOW: started the way the cases above start one, with
   * --stop-with-pid naming a process that is then killed outright, as a run ended from outside is. This stand-in also
   * ignores SIGTERM, as the first case's does. MUTATION: its watch removed from standInSource, and this goes red.
   */
  it('a stand-in ends when the process it watches is killed, though it ignores SIGTERM', async () => {
    const fixture = await standInCheckout(null)
    const starter = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' })
    if (starter.pid === undefined) throw new Error('the starter did not start')
    const starterGone = new Promise<void>((done) => starter.once('exit', () => done()))
    const started = spawn(process.execPath, ['--import', 'tsx', fixture.entry, `--stop-with-pid=${String(starter.pid)}`], {
      cwd: fixture.root, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
    })
    const pgid = started.pid
    if (pgid === undefined) throw new Error('the stand-in did not start')
    let output = ''
    started.stdout?.on('data', (chunk: Buffer) => { output += chunk.toString() })
    started.stderr?.on('data', (chunk: Buffer) => { output += chunk.toString() })
    const gone = new Promise<void>((done) => started.once('close', () => done()))
    const groupIsThere = (group: number): boolean => {
      try { process.kill(-group, 0); return true } catch (err) { return (err as NodeJS.ErrnoException).code === 'EPERM' }
    }
    try {
      await untilStandIn(() => output.includes('stand-in ready'), () => output)
      process.kill(-starter.pid, 'SIGKILL')
      await starterGone
      await untilStandIn(() => !groupIsThere(pgid), () => `the stand-in's group ${String(pgid)} is still there: ${output}`, 10_000)
    } finally {
      for (const group of [pgid, starter.pid]) {
        try { process.kill(-group, 'SIGKILL') } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== 'ESRCH') throw err
        }
      }
      await gone
      rmSync(fixture.root, { recursive: true, force: true })
    }
  }, 30_000)
})

// ========================================================= waiting for somebody else's service lock

/** One detached holder and a child using wave 13t's lock, on a scratch database and port. */
async function serviceLockScene(code = THE_SERVICE_LOCK_REFUSAL_EXIT_CODE, options: {
  lockInitially?: boolean
  guardAtStart?: Record<number, string>
  unknownOwnProcessAtStart?: number[]
  filingStatus?: 200 | 500
  waitToAnswer?: boolean
} = {}) {
  const fixture = await standInCheckout(0)
  const database = join(fixture.root, 'held.db')
  const lockPath = serviceLockPathFrom({ MOLE_OFFICE_DB: database })
  const holder = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    detached: true, stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (holder.pid === undefined) throw new Error('the stand-in holder did not start')
  const holderPid = holder.pid
  const closed = new Promise<void>((done) => holder.once('close', () => done()))
  const holderPort = await freePort()
  let sentence = ''
  const holdLock = async () => {
    const held = await takeTheServiceLock({
      lockPath, databasePath: database, port: holderPort, checkout: fixture.root,
      pid: holderPid, readProcess: theProcessReading,
    })
    if (!held.taken) throw new Error(held.said)
    sentence = theLockIsHeldSentence(lockPath, held.lock)
  }
  if (options.lockInitially !== false) await holdLock()
  writeFileSync(fixture.entry, `
    import { appendFileSync, existsSync, readFileSync } from 'node:fs'
    import { createServer } from 'node:http'
    import { takeTheServiceLock, theProcessReading, releaseTheServiceLock } from ${JSON.stringify(join(REPO, 'src/config/the-service-lock.mjs'))}
    appendFileSync('.starts', String(process.pid) + '\\n')
    const start = readFileSync('.starts', 'utf8').trim().split('\\n').length
    // G's fixture reading: acquisition cannot read its own process and writes no lock.
    const readProcess = ${JSON.stringify(options.unknownOwnProcessAtStart ?? [])}.includes(start)
      ? () => ({ here: true, startedAt: null, pgid: process.pid }) : theProcessReading
    const lock = await takeTheServiceLock({
      lockPath: ${JSON.stringify(lockPath)}, databasePath: ${JSON.stringify(database)},
      port: ${fixture.port}, checkout: ${JSON.stringify(fixture.root)}, pid: process.pid, readProcess,
    })
    if (!lock.taken) { console.log(lock.said); process.exit(${code}) }
    process.on('exit', () => releaseTheServiceLock(${JSON.stringify(lockPath)}, lock.lock.token))
    const refusal = ${JSON.stringify(options.guardAtStart ?? {})}[start]
    if (refusal) { process.stderr.write('Error: ' + refusal + '\\n'); process.exit(1) }
    const server = createServer((req, res) => {
      res.setHeader('content-type', 'application/json')
      if (req.method === 'GET' && req.url === '/api/health') {
        const ready = ${options.waitToAnswer !== true} || existsSync('.health-ready')
        if (ready) appendFileSync('.health-answers', 'answered\\n')
        res.statusCode = ready ? 200 : 503
        res.end(JSON.stringify({ ok: ready }))
      } else if (req.method === 'POST' && req.url === '/api/records') {
        let body = ''
        req.on('data', (chunk) => { body += chunk })
        req.on('end', () => {
          appendFileSync('.posts', JSON.stringify({ path: req.url, body: JSON.parse(body) }) + '\\n')
          res.statusCode = ${options.filingStatus ?? 200}
          res.end('{}')
        })
      } else { res.end('{}') }
    })
    // ON THE SOCKET SERVE-DEV HOLDS, as src/server/index.ts listens (problem xGeC_iM6jxYl).
    server.listen(process.env.MOLE_OFFICE_LISTEN_FD ? { fd: Number(process.env.MOLE_OFFICE_LISTEN_FD) } : { port: ${fixture.port}, host: '127.0.0.1' })
    process.on('SIGTERM', () => server.close(() => process.exit(0)))
  `)
  const starts = () => existsSync(join(fixture.root, '.starts'))
    ? readFileSync(join(fixture.root, '.starts'), 'utf8').trim().split('\n').map(Number) : []
  const lines: string[] = []
  const realKill = process.kill.bind(process)
  const signalled = vi.spyOn(process, 'kill')
  vi.stubEnv('MOLE_OFFICE_PORT', String(fixture.port))
  vi.stubEnv('MOLE_OFFICE_DB', database)
  vi.stubEnv('MOLE_OFFICE_CHECK_FOR_MISSED_CHANGES', '0')
  // One failure reaches the threshold, proving that a refusal bypasses the crash-loop path.
  vi.stubEnv('MOLE_OFFICE_FAILED_STARTS_BEFORE_SAYING', '1')
  // A health retry that is not the first backoff: with a 250 ms good run, a child slower than that to exit is asked
  // for its health, and a 500 ms retry would look like the backoff this scene says never comes.
  const owner = await serveDev({ clocks: { ...THE_TEST_CLOCKS, healthRetry: 300 }, root: fixture.root, writeItDown: false, say: (line) => lines.push(line) })
  const stopHolder = async () => {
    if (holder.exitCode === null && holder.signalCode === null) realKill(-holderPid, 'SIGTERM')
    await closed
  }
  return {
    ...fixture, lockPath, holderPid, get sentence() { return sentence }, starts, lines, owner, stopHolder, holdLock,
    posts: (): { path: string; body: { kind: string; title: string; data: { body: string } } }[] =>
      existsSync(join(fixture.root, '.posts'))
        ? readFileSync(join(fixture.root, '.posts'), 'utf8').trim().split('\n').map((line) => JSON.parse(line)) : [],
    answer: () => writeFileSync(join(fixture.root, '.health-ready'), 'the case allows health to answer\n'),
    answered: () => existsSync(join(fixture.root, '.health-answers')),
    async stop() {
      try {
        await owner.stop()
        expect(signalled.mock.calls.filter(([pid, signal]) =>
          (pid === holderPid || pid === -holderPid) && signal !== 0)).toEqual([])
      } finally {
        signalled.mockRestore()
        await stopHolder()
        vi.unstubAllEnvs()
        rmSync(fixture.root, { recursive: true, force: true })
      }
    },
  }
}

describe('serve-dev honours wave 13t’s service lock, decision g_icMYOZxkQZ', () => {
  /** MUTATION: treat the lock's exit code as an ordinary exit. This case restarts and arms backoff. */
  it('counts a service-lock refusal without backoff or a crash loop, and names the holder once', async () => {
    const timeouts = vi.spyOn(globalThis, 'setTimeout')
    const intervals = vi.spyOn(globalThis, 'setInterval')
    const scene = await serviceLockScene()
    try {
      await untilStandIn(() => scene.lines.some((line) => line.includes('started no second server')),
        () => scene.lines.join('\n'))
      await sleep(theBackoffAfter(1) + 500)
      expect(scene.starts()).toHaveLength(1)
      expect(scene.owner.restartsSoFar()).toBe(0)
      expect(timeouts.mock.calls.filter(([, delay]) => delay === theBackoffAfter(1))).toEqual([])
      const looks = intervals.mock.calls.flatMap(([, delay], index) =>
        delay === THE_TEST_CLOCKS.serviceLockLook ? [intervals.mock.results[index]?.value as NodeJS.Timeout] : [])
      expect(looks).toHaveLength(1)
      expect(looks[0]?.hasRef()).toBe(false)
      const refusal = readFileSync(theRefusalFileIn(scene.root), 'utf8').trim()
      expect(refusal).toBe(`${scene.sentence} serve-dev started no second server. It will start again on its own when the service lock is free.`)
      expect(scene.lines.filter((line) => line.includes(scene.sentence))).toEqual([`[dev] ${refusal}`])
      expect(readTheTrouble(scene.root)).toBeNull()
      expect(scene.lines.join('\n')).not.toContain('in a row')
      const clear = vi.spyOn(globalThis, 'clearInterval')
      await scene.owner.stop()
      expect(clear.mock.calls.some(([timer]) => timer === looks[0])).toBe(true)
      clear.mockRestore()
    } finally {
      await scene.stop()
      timeouts.mockRestore()
      intervals.mockRestore()
    }
  }, 30_000)

  /** MUTATION: omit startTheServiceLockLook. No second start comes after either release or a stale lock. */
  it.each(['process gone', 'lock removed', 'stale start time'] as const)(
    'starts once on its own after the holder is released: %s', async (release) => {
      const scene = await serviceLockScene()
      try {
        await untilStandIn(() => existsSync(theRefusalFileIn(scene.root)), () => scene.lines.join('\n'))
        if (release === 'process gone') {
          // This signal is the test's, never the supervisor's, to the group recorded at spawn.
          await scene.stopHolder()
        } else if (release === 'lock removed') {
          rmSync(scene.lockPath)
        } else {
          const lock = JSON.parse(readFileSync(scene.lockPath, 'utf8')) as Record<string, unknown>
          writeFileSync(scene.lockPath, JSON.stringify({ ...lock, processStartedAt: 'a previous process' }))
        }
        await untilStandIn(() => scene.starts().length >= 2, () => scene.lines.join('\n'))
        await sleep(2 * THE_TEST_CLOCKS.serviceLockLook + 100)
        expect(scene.starts()).toHaveLength(2)
        expect(scene.owner.restartsSoFar()).toBe(1)
        expect(scene.lines.filter((line) => line === '[dev] the service lock is free, starting the server again.')).toHaveLength(1)
      } finally {
        await scene.stop()
      }
    }, 30_000,
  )

  /** MUTATION: remove restart's service-lock check. A watched change starts beside the holder. */
  it('keeps looking and says once that watched file changes cannot start beside the holder', async () => {
    const scene = await serviceLockScene()
    try {
      await untilStandIn(() => existsSync(theRefusalFileIn(scene.root)), () => scene.lines.join('\n'))
      appendFileSync(scene.entry, '\n// change while the lock is held\n')
      await untilStandIn(() => scene.lines.some((line) => line.includes('a watched file changed')) || scene.starts().length > 1,
        () => scene.lines.join('\n'))
      appendFileSync(scene.entry, '\n// another change while the lock is held\n')
      await sleep(2 * THE_TEST_CLOCKS.serviceLockLook + 100)
      expect(scene.starts()).toHaveLength(1)
      expect(scene.owner.restartsSoFar()).toBe(0)
      expect(scene.lines.filter((line) => line.includes('a watched file changed'))).toEqual([
        '[dev] a watched file changed while another server holds the database. serve-dev started no second server and will keep looking for the service lock to be free.',
      ])
      rmSync(scene.lockPath)
      await untilStandIn(() => scene.starts().length === 2, () => scene.lines.join('\n'))
      expect(scene.owner.restartsSoFar()).toBe(1)
    } finally {
      await scene.stop()
    }
  }, 30_000)

  /** Plain case: another exit code, even with the lock sentence in stdout, retains its backoff. */
  it('restarts a child with another exit code using the ordinary growing backoff', async () => {
    const scene = await serviceLockScene(1)
    try {
      await untilStandIn(() => scene.starts().length >= 3, () => scene.lines.join('\n'))
      expect(scene.lines.join('\n')).toContain('1 in a row. Starting it again in 0.5s.')
      expect(scene.lines.join('\n')).toContain('2 in a row. Starting it again in 1s.')
      expect(readTheTrouble(scene.root)?.failedStarts).toBeGreaterThanOrEqual(2)
      expect(existsSync(theRefusalFileIn(scene.root))).toBe(false)
    } finally {
      await scene.stop()
    }
  }, 30_000)
})

// ======================================== 5DLbHt7Fq3ce: a lock is not evidence of a guard refusal

const firstGuardRefusal = `${THE_GUARD_REFUSALS_BEGIN}USE the test database. It is NOT a Mole Office database.`
const secondGuardRefusal = `${THE_GUARD_REFUSALS_BEGIN}SERVE the test database. It holds 4 records, links and changes, it is NOT up to date, and bringing it up to date would write to it.`

type LockScene = Awaited<ReturnType<typeof serviceLockScene>>
const refusalText = (scene: LockScene) => existsSync(theRefusalFileIn(scene.root))
  ? readFileSync(theRefusalFileIn(scene.root), 'utf8').trim() : ''
const sceneSays = (scene: LockScene) => () => scene.lines.join('\n')

/** A watched restart after a guard refusal meets somebody else's lock. */
async function guardThenLock(scene: LockScene): Promise<void> {
  await untilStandIn(() => refusalText(scene) === firstGuardRefusal, sceneSays(scene))
  await scene.holdLock()
  appendFileSync(scene.entry, '\n// the case restarts after the first guard refusal\n')
  await untilStandIn(() => scene.lines.some((line) => line.includes('started no second server')), sceneSays(scene))
  expect(scene.starts()).toHaveLength(2)
  expect(refusalText(scene)).toContain(scene.sentence)
}

describe('serve-dev reports only observed refusals, inspector 5DLbHt7Fq3ce, invariant 3', () => {
  /**
   * A. MUTATION: exit 75 sets theRefusal and theOfficeWentDownAt, as the first pass did.
   * A lock alone then files a false guard/down-time note. Both ways of finding it free are checked.
   */
  it.each(['look', 'watched restart'] as const)('A: a lock alone files no note after the %s finds it free', async (freeBy) => {
    const scene = await serviceLockScene(undefined, { waitToAnswer: true })
    try {
      await untilStandIn(() => refusalText(scene).includes(scene.sentence), sceneSays(scene))
      await scene.stopHolder()
      if (freeBy === 'watched restart') appendFileSync(scene.entry, '\n// the restart finds the lock free\n')
      await untilStandIn(() => scene.starts().length === 2, sceneSays(scene))
      expect(existsSync(theRefusalFileIn(scene.root))).toBe(false)
      scene.answer()
      await untilStandIn(scene.answered, sceneSays(scene))
      // The response has reached the supervisor before asserting the absence of a POST.
      await sleep(200)
      expect(scene.posts()).toEqual([])
      expect(existsSync(theRefusalFileIn(scene.root))).toBe(false)
      expect(scene.lines.join('\n')).not.toMatch(/guard refused|start guard|office was down/)
    } finally {
      await scene.stop()
    }
  }, 30_000)

  /** B. MUTATION: the note ignores the intervening lock and uses its original down-time title/body. */
  it('B: a guard then a lock files one note in order, without claiming office down time', async () => {
    const scene = await serviceLockScene(undefined, {
      lockInitially: false, guardAtStart: { 1: firstGuardRefusal }, waitToAnswer: true,
    })
    try {
      await guardThenLock(scene)
      await scene.stopHolder()
      await untilStandIn(() => scene.starts().length === 3, sceneSays(scene))
      expect(refusalText(scene)).toBe(firstGuardRefusal)
      scene.answer()
      await untilStandIn(() => scene.lines.some((line) => line.includes('were filed in the office as one note')), sceneSays(scene))
      expect(scene.posts()).toHaveLength(1)
      const post = scene.posts()[0]!
      expect(post.path).toBe('/api/records')
      expect(post.body.kind).toBe('note')
      expect(post.body.title).not.toContain('down')
      expect(post.body.data.body).not.toContain('down')
      const body = post.body.data.body
      expect(body).toMatch(/The start guard refused to serve the database at \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/)
      expect(body).toContain(firstGuardRefusal)
      expect(body).toContain(scene.sentence)
      expect(body).toMatch(/serve-dev's own server answered again at \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/)
      expect(body.indexOf(firstGuardRefusal)).toBeLessThan(body.indexOf(scene.sentence))
      expect(body.indexOf(scene.sentence)).toBeLessThan(body.indexOf("serve-dev's own server answered again"))
      expect(existsSync(theRefusalFileIn(scene.root))).toBe(false)
      expect(scene.lines.join('\n')).not.toContain('office was down')
    } finally {
      await scene.stop()
    }
  }, 30_000)

  /** B2. MUTATION: finding the lock free removes the refusal file even while the guard note awaits filing. */
  it('B2: a refused filing leaves the guard refusal in the file, as the supervisor says', async () => {
    const scene = await serviceLockScene(undefined, {
      lockInitially: false, guardAtStart: { 1: firstGuardRefusal }, filingStatus: 500, waitToAnswer: true,
    })
    try {
      await guardThenLock(scene)
      await scene.stopHolder()
      appendFileSync(scene.entry, '\n// a watched restart finds the lock free\n')
      await untilStandIn(() => scene.starts().length === 3, sceneSays(scene))
      scene.answer()
      await untilStandIn(() => scene.lines.some((line) => line.includes('the refusal could not be filed')), sceneSays(scene))
      expect(scene.posts()).toHaveLength(1)
      expect(scene.lines.join('\n')).toContain('the office answered 500')
      expect(scene.lines.join('\n')).toContain('it is still in .logs/last-refusal.txt and in this log.')
      expect(refusalText(scene)).toBe(firstGuardRefusal)
    } finally {
      await scene.stop()
    }
  }, 30_000)

  /** C. MUTATION: the first pass's lock fact in theRefusal turns this case red as well as A. */
  it('C: after a lock, a guard refusal is said, replaces the file, and arms the migration look', async () => {
    const intervals = vi.spyOn(globalThis, 'setInterval')
    const scene = await serviceLockScene(undefined, { guardAtStart: { 2: secondGuardRefusal }, waitToAnswer: true })
    try {
      await untilStandIn(() => refusalText(scene).includes(scene.sentence), sceneSays(scene))
      await scene.stopHolder()
      await untilStandIn(() => scene.starts().length === 2, sceneSays(scene))
      // Wait for exit handling, with a bounded wait that also exposes the first pass's silence.
      await untilStandIn(() => scene.lines.some((line) => line.includes(`The guard said: ${secondGuardRefusal}`)), sceneSays(scene))
      expect(refusalText(scene)).toBe(secondGuardRefusal)
      const looks = intervals.mock.calls.flatMap(([look, delay], index) =>
        delay === THE_TEST_CLOCKS.migrationLook && look.name === 'lookForTheLandedMigration' ? [intervals.mock.results[index]?.value as NodeJS.Timeout] : [])
      expect(looks).toHaveLength(1)
      expect(looks[0]?.hasRef()).toBe(false)
      expect(scene.posts()).toEqual([])
      // The pending note belongs to the guard, even though the lock refused an earlier start.
      appendFileSync(scene.entry, '\n// the next start can answer after the guard refusal\n')
      await untilStandIn(() => scene.starts().length === 3, sceneSays(scene))
      scene.answer()
      await untilStandIn(() => scene.lines.some((line) => line.includes('were filed in the office as one note')), sceneSays(scene))
      expect(scene.posts()).toHaveLength(1)
      expect(scene.posts()[0]!.body.data.body).toContain(secondGuardRefusal)
      expect(scene.posts()[0]!.body.data.body).not.toContain(scene.sentence)
    } finally {
      await scene.stop()
      intervals.mockRestore()
    }
  }, 30_000)

  /** D. MUTATION: speak, write and start the migration look only when theRefusal === null. */
  it('D: a second guard refusal after a lock is said and acted on while the first note waits', async () => {
    const intervals = vi.spyOn(globalThis, 'setInterval')
    const scene = await serviceLockScene(undefined, {
      lockInitially: false, guardAtStart: { 1: firstGuardRefusal, 3: secondGuardRefusal }, waitToAnswer: true,
    })
    try {
      await guardThenLock(scene)
      await scene.stopHolder()
      await untilStandIn(() => scene.lines.some((line) => line.includes(`The guard said: ${secondGuardRefusal}`)), sceneSays(scene))
      expect(scene.starts()).toHaveLength(3)
      expect(refusalText(scene)).toBe(secondGuardRefusal)
      const looks = intervals.mock.calls.flatMap(([look, delay], index) =>
        delay === THE_TEST_CLOCKS.migrationLook && look.name === 'lookForTheLandedMigration' ? [intervals.mock.results[index]?.value as NodeJS.Timeout] : [])
      expect(looks).toHaveLength(1)
      expect(looks[0]?.hasRef()).toBe(false)
      appendFileSync(scene.entry, '\n// the next start can answer\n')
      await untilStandIn(() => scene.starts().length === 4, sceneSays(scene))
      scene.answer()
      await untilStandIn(() => scene.lines.some((line) => line.includes('were filed in the office as one note')), sceneSays(scene))
      expect(scene.posts()).toHaveLength(1)
      expect(scene.posts()[0]!.body.data.body).toContain(firstGuardRefusal)
      expect(scene.posts()[0]!.body.data.body).not.toContain(secondGuardRefusal)
      expect(existsSync(theRefusalFileIn(scene.root))).toBe(false)
    } finally {
      await scene.stop()
      intervals.mockRestore()
    }
  }, 40_000)

  /** H. MUTATION: restore pass 2's title claiming another server held the database. */
  it('H: a guard then a child with no own process reading files only observed refusals', async () => {
    const scene = await serviceLockScene(undefined, {
      lockInitially: false, guardAtStart: { 1: firstGuardRefusal },
      unknownOwnProcessAtStart: [2, 3], waitToAnswer: true,
    })
    try {
      await untilStandIn(() => refusalText(scene) === firstGuardRefusal, sceneSays(scene))
      appendFileSync(scene.entry, '\n// start after the guard refusal\n')
      await untilStandIn(() => scene.lines.some((line) => line.includes('but the server refused it again')), sceneSays(scene))
      expect(scene.starts()).toHaveLength(3)
      expect(existsSync(scene.lockPath)).toBe(false)
      const childRefusal = scene.lines.find((line) => line.includes('started no second server'))!
        .slice('[dev] '.length).split(' serve-dev started no second server.')[0]!
      expect(childRefusal).toContain('It could not read its own start time and process group')
      appendFileSync(scene.entry, '\n// a watched change permits a server that can answer\n')
      await untilStandIn(() => scene.starts().length === 4, sceneSays(scene))
      scene.answer()
      await untilStandIn(() => scene.lines.some((line) => line.includes('were filed in the office as one note')), sceneSays(scene))
      expect(scene.posts()).toHaveLength(1)
      const note = scene.posts()[0]!.body
      expect(note.title).toBe('The guard refused to start the server, the service lock refused a later start, and this server answered again')
      expect(note.title).not.toContain('another server held the database')
      expect(note.data.body).not.toContain('another server held the database')
      expect(note.data.body).toContain(childRefusal)
      expect(note.data.body).toContain(firstGuardRefusal)
      expect(note.data.body.indexOf(firstGuardRefusal)).toBeLessThan(note.data.body.indexOf(childRefusal))
      expect(note.data.body.indexOf(childRefusal)).toBeLessThan(note.data.body.indexOf("serve-dev's own server answered again"))
      expect(note.data.body).toMatch(/The start guard refused to serve the database at \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/)
      expect(note.data.body).toMatch(/serve-dev's own server answered again at \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/)
      expect(note.data.body).not.toContain('down')
      expect(scene.lines).toContain('[dev] the guard refusal, the service-lock refusal after it, and this server’s answer were filed in the office as one note.')
      expect(existsSync(theRefusalFileIn(scene.root))).toBe(false)
    } finally {
      await scene.stop()
    }
  }, 40_000)

  /** I. MUTATION: omit takeBackTheLockRefusal on this server's answer. */
  it('I: an answer after a lock disagreement takes back the refusal file with no guard note waiting', async () => {
    const scene = await serviceLockScene(undefined, {
      lockInitially: false, unknownOwnProcessAtStart: [1, 2], waitToAnswer: true,
    })
    try {
      await untilStandIn(() => scene.lines.some((line) => line.includes('but the server refused it again')), sceneSays(scene))
      expect(scene.starts()).toHaveLength(2)
      expect(existsSync(scene.lockPath)).toBe(false)
      const disagreement = refusalText(scene)
      expect(disagreement).toContain('It could not read its own start time and process group')
      appendFileSync(scene.entry, '\n// a watched change permits a server that can answer\n')
      await untilStandIn(() => scene.starts().length === 3, sceneSays(scene))
      expect(refusalText(scene)).toBe(disagreement)
      scene.answer()
      await untilStandIn(() => scene.lines.includes('[dev] the server is answering, so the run of failed starts is over.'), sceneSays(scene))
      expect(scene.answered()).toBe(true)
      expect(existsSync(theRefusalFileIn(scene.root))).toBe(false)
      expect(scene.posts()).toEqual([])
    } finally {
      await scene.stop()
    }
  }, 30_000)

  /** I2. MUTATION: take the file back on an answer without restoring the waiting guard refusal. */
  it('I2: a refused filing after a lock disagreement leaves the guard refusal as the log says', async () => {
    const scene = await serviceLockScene(undefined, {
      lockInitially: false, guardAtStart: { 1: firstGuardRefusal },
      unknownOwnProcessAtStart: [2, 3], filingStatus: 500, waitToAnswer: true,
    })
    try {
      await untilStandIn(() => refusalText(scene) === firstGuardRefusal, sceneSays(scene))
      appendFileSync(scene.entry, '\n// start after the guard refusal\n')
      await untilStandIn(() => scene.lines.some((line) => line.includes('but the server refused it again')), sceneSays(scene))
      expect(scene.starts()).toHaveLength(3)
      expect(existsSync(scene.lockPath)).toBe(false)
      const disagreement = refusalText(scene)
      expect(disagreement).toContain('It could not read its own start time and process group')
      appendFileSync(scene.entry, '\n// a watched change permits a server that can answer\n')
      await untilStandIn(() => scene.starts().length === 4, sceneSays(scene))
      expect(refusalText(scene)).toBe(disagreement)
      scene.answer()
      await untilStandIn(() => scene.lines.some((line) => line.includes('the refusal could not be filed')), sceneSays(scene))
      expect(scene.posts()).toHaveLength(1)
      expect(scene.lines.join('\n')).toContain('the office answered 500')
      expect(scene.lines.join('\n')).toContain('it is still in .logs/last-refusal.txt and in this log.')
      expect(refusalText(scene)).toBe(firstGuardRefusal)
    } finally {
      await scene.stop()
    }
  }, 40_000)

  /** E. MUTATION: use the first pass's watched-change wording, claiming a holder despite an unreadable lock. */
  it('E: an unreadable lock says the supervisor cannot tell and starts no second server', async () => {
    const scene = await serviceLockScene()
    try {
      await untilStandIn(() => refusalText(scene).includes(scene.sentence), sceneSays(scene))
      writeFileSync(scene.lockPath, 'this test text is not a lock\n')
      appendFileSync(scene.entry, '\n// change while the lock cannot be read\n')
      await untilStandIn(() => scene.lines.some((line) => line.includes('a watched file changed')), sceneSays(scene))
      await sleep(2 * THE_TEST_CLOCKS.serviceLockLook + 100)
      const line = scene.lines.find((line) => line.includes('a watched file changed'))!
      expect(line).toContain('the supervisor cannot tell whether the service lock is free')
      expect(line).not.toContain('another server holds the database')
      expect(scene.starts()).toHaveLength(1)
      expect(scene.owner.restartsSoFar()).toBe(0)
      expect(scene.posts()).toEqual([])
    } finally {
      await scene.stop()
    }
  }, 30_000)
})

// ========================================================== the file a run of failed starts is in

describe('a run of failed starts is written down and read back', () => {
  let dir = ''

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'mole-office-trouble-'))
  })

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('says the count and the last exit, in one plain sentence', () => {
    const says = whatTheTroubleSays(aRunOfFailures())
    expect(says).toContain('96 times in a row')
    expect(says).toContain('exit code 1')
    expect(says).toContain(String(THE_PORT))
  })

  it('comes back the way it went in', () => {
    writeTheTrouble(dir, aRunOfFailures())
    const read = readTheTrouble(dir)
    expect(read?.failedStarts).toBe(96)
    expect(read?.lastOutput[0]).toContain('EADDRINUSE')
    expect(existsSync(theTroubleFileIn(dir))).toBe(true)
  })

  it('reads as nothing once nothing has rewritten it for two minutes', () => {
    const old = aRunOfFailures({ atMs: Date.now() - THE_TROUBLE_IS_STALE_AFTER - 1000 })
    expect(theTroubleStillStands(old)).toBe(false)
    writeTheTrouble(dir, old)
    expect(readTheTrouble(dir)).toBeNull()
  })

  it('still stands while the supervisor is rewriting it, which it does on every failure', () => {
    expect(theTroubleStillStands(aRunOfFailures({ atMs: Date.now() - 30_000 }))).toBe(true)
  })

  it('reads as nothing when there is no file at all, which is every ordinary minute', () => {
    rmSync(theTroubleFileIn(dir), { force: true })
    expect(readTheTrouble(dir)).toBeNull()
  })
})

// ============================================ what the server and the page say about a crash loop

describe('the server reads the file about its own port and its own checkout, and nobody else’s', () => {
  let dir = ''
  let theFailedStartsOfThisCheckoutsSupervisor: (port: number | null, root?: string) => SupervisorFailedStarts | null
  let whatIsWrongWithThisServer: typeof import('../src/server/lib/health.ts').whatIsWrongWithThisServer
  let db: TestDb | null = null

  beforeAll(async () => {
    // src/server/lib/runtime.ts opens the database when it is imported, so a temporary one is named
    // first. tests/no-test-opens-the-live-corpus.test.ts is what catches a test that forgets.
    db = await freshDb()
    ;({ theFailedStartsOfThisCheckoutsSupervisor } = await import('../src/server/lib/runtime.ts'))
    ;({ whatIsWrongWithThisServer } = await import('../src/server/lib/health.ts'))
    dir = mkdtempSync(join(tmpdir(), 'mole-office-reading-'))
    writeTheTrouble(dir, aRunOfFailures({ repository: dir, port: 29999 }))
  })

  afterAll(() => {
    db?.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('reports it, with the count, the last exit and the group that stopping the supervisor signals', () => {
    const read = theFailedStartsOfThisCheckoutsSupervisor(29999, dir)
    expect(read?.count).toBe(96)
    expect(read?.lastExit).toBe('exit code 1')
    expect(read?.supervisor.pgid).toBe(845844)
    expect(read?.says).toContain('96 times in a row')
  })

  it('turns the two moments into local wall-clock, which is what a person reads', () => {
    const read = theFailedStartsOfThisCheckoutsSupervisor(29999, dir)
    expect(read?.at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    expect(read?.since).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  })

  it('says nothing about a supervisor of another port, because a scratch stack is not this one', () => {
    expect(theFailedStartsOfThisCheckoutsSupervisor(29998, dir)).toBeNull()
  })

  it('says nothing about a file naming another checkout', () => {
    const elsewhere = mkdtempSync(join(tmpdir(), 'mole-office-elsewhere-'))
    writeTheTrouble(elsewhere, aRunOfFailures({ repository: `${THE_TEST_FIXTURE_ROOT}/px-elsewhere`, port: 29999 }))
    expect(theFailedStartsOfThisCheckoutsSupervisor(29999, elsewhere)).toBeNull()
    rmSync(elsewhere, { recursive: true, force: true })
  })

  it('makes GET /api/health say ok false, with the sentence and what to do about it', () => {
    const world = {
      repository: REPO.replace(/\/$/, ''),
      database: '/nowhere/panelx.db',
      databaseIdentity: 'x',
      port: 29999,
      head: null,
      standing: { kind: 'canonical' as const, because: [] },
    }
    const fresh = { verdict: 'as new as the checkout', staleFor: null, grace: 15 }
    const failing = theFailedStartsOfThisCheckoutsSupervisor(29999, dir)
    const wrong = whatIsWrongWithThisServer(world as never, fresh as never, null, failing)
    expect(wrong.join(' ')).toContain('96 times in a row')
    expect(wrong.join(' ')).toContain('kill -TERM -845844')
    // And a server whose supervisor is starting servers normally has nothing wrong with it.
    expect(whatIsWrongWithThisServer(world as never, fresh as never, null, null)).toEqual([])
  })
})

describe('the page’s red banner names a supervisor that cannot start a server', () => {
  const facts = (failedStarts: RuntimeFactsForThePage['supervisor']['failedStarts']): RuntimeFactsForThePage => ({
    addresses: { canonicalWeb: 'http://127.0.0.1:5173', canonicalWebForOtherMachines: null },
    database: { path: '/a/panelx.db', canonicalPath: '/a/panelx.db', canonical: true },
    freshness: {
      verdict: 'as new as the checkout',
      newestOnDisk: '2026-09-04 10:00:00',
      newestOnDiskFile: 'src/web/App.tsx',
      newestForThePage: '2026-09-04 10:00:00',
      newestFileForThePage: 'src/web/App.tsx',
    },
    supervisor: { failedStarts },
  })
  const served = { servedAt: '2026-09-04 10:00:00' }
  const now = new Date('2026-09-04T10:00:05').getTime()

  afterAll(() => {
    forgetTheWorldOnThisPage()
  })

  it('draws nothing while the supervisor is starting servers normally', () => {
    expect(compareThisPageWith(facts(null), 'http://127.0.0.1:5173', served, now)).toEqual([])
  })

  it('draws a row naming the count, the last exit and the group to stop', () => {
    const found = compareThisPageWith(
      facts({
        count: 96,
        lastExit: 'exit code 1',
        says: whatTheTroubleSays(aRunOfFailures()),
        supervisor: { pgid: 845844 },
      }),
      'http://127.0.0.1:5173',
      served,
      now,
    )
    expect(found).toHaveLength(1)
    expect(found[0]?.onTheServer).toContain('96 times in a row')
    expect(found[0]?.doThis).toContain('kill -TERM -845844')
  })
})

// =============================================== a supervisor is named only when it is one, of here

describe('the runtime record names a supervisor only when the parent is one, and one of this checkout', () => {
  let db: TestDb | null = null
  let supervisorOf: typeof import('../src/server/lib/runtime.ts').supervisorOf
  let whatTheParentIs: typeof import('../src/server/lib/runtime.ts').whatTheParentIs
  let useOsProbe: typeof import('../src/server/lib/resources.ts').useOsProbe
  let realProbe: unknown = null

  /** A process table with one process in it, and the working directory that goes with it. */
  const aParent = (command: string, workingDirectory: string | null): unknown => ({
    processById: () => ({ pid: 4242, pgid: 4242, command, startedAt: '2026-09-04 09:00:00', directoryChangedAt: null }),
    processesInGroup: () => [],
    killProcessGroup: () => undefined,
    processFacts: () => (workingDirectory === null ? null : { workingDirectory, couldNotRead: [] }),
  })

  beforeAll(async () => {
    db = await freshDb()
    ;({ supervisorOf, whatTheParentIs } = await import('../src/server/lib/runtime.ts'))
    const resources = await import('../src/server/lib/resources.ts')
    useOsProbe = resources.useOsProbe
    realProbe = resources.osProbe()
  })

  afterAll(() => {
    useOsProbe(realProbe as never)
    db?.close()
  })

  const read = (command: string, workingDirectory: string | null): ReturnType<typeof supervisorOf> => {
    useOsProbe(aParent(command, workingDirectory) as never)
    // The Gaps class is not exported; the record's own reader supplies one. `supervisorOf` takes it
    // to note what it could not read, and nothing here stops it being read.
    return supervisorOf(4242, { note: () => undefined } as never, null)
  }

  it('names this checkout’s own dev supervisor', () => {
    const reading = read('node tools/serve-dev.mjs', REPO.replace(/\/$/, ''))
    expect(reading.watching).toBe(true)
    expect(reading.kind).toBe('the dev supervisor')
    expect(reading.pid).toBe(4242)
    expect(reading.says).toContain('is watching this server')
  })

  it('does not call systemd a supervisor, and names it for what it is', () => {
    const reading = read('/usr/lib/systemd/systemd --user --deserialize=42', null)
    expect(reading.watching).toBe(false)
    expect(reading.kind).toBe('nothing that restarts it')
    // THE FIELDS, NOT ONLY THE SENTENCE. On 4 September 2026 the sentence was right and the fields
    // said the supervisor was systemd, pid 1.
    expect(reading.pid).toBeNull()
    expect(reading.pgid).toBeNull()
    expect(reading.commandLine).toBeNull()
    expect(reading.parent?.pid).toBe(4242)
    expect(reading.parent?.what).toContain('systemd')
    expect(reading.says).toContain('Nothing is watching this server')
  })

  it('does not call a dev supervisor of another checkout a supervisor of this one', () => {
    const reading = read('node tools/serve-dev.mjs', `${THE_TEST_FIXTURE_ROOT}/px-somewhere-else`)
    expect(reading.watching).toBe(false)
    expect(reading.pid).toBeNull()
    expect(reading.says).toContain(`${THE_TEST_FIXTURE_ROOT}/px-somewhere-else`)
    expect(reading.says).toContain('not this checkout')
  })

  it('believes an absolute path on the command line, for somebody who typed one', () => {
    const reading = read(`node ${REPO}tools/serve-dev.mjs`, '/somewhere/else/entirely')
    expect(reading.watching).toBe(true)
  })

  it('names a shell and a test runner for what they are', () => {
    expect(whatTheParentIs('/bin/bash')).toBe('a shell')
    expect(whatTheParentIs('node /a/node_modules/vitest/vitest.mjs run')).toBe('a test runner')
    expect(whatTheParentIs('/usr/lib/systemd/systemd --user')).toContain('systemd')
    // Anything else is handed back as it is, rather than being called something it may not be.
    expect(whatTheParentIs('/opt/thing/weird --run')).toBe('/opt/thing/weird --run')
  })
})

// ==================================== the page that could not start reads the same file through Vite

/**
 * THE ONE READING THAT WORKS WHEN NOTHING IS ANSWERING.
 *
 * `GET /api/health` and the runtime record both need a server, and the state this is for is the one
 * where there is none. Vite is the process still running that can read a file and hand it to a
 * browser, and `src/web/index.html` asks it for one plainly, with no module of its own.
 */
describe('Vite hands the page the file, and the page asks for it at the address Vite serves', () => {
  let vite: ViteDevServer | null = null
  let site = ''
  let cacheDir = ''
  let noWatchWas: string | undefined
  /**
   * A COPY OF THE CHECKOUT FOR THIS VITE, so the trouble file it serves is the copy's own.
   *
   * vite.config.ts reads the trouble file from the checkout it sits in, at the fixed path
   * `.logs/the-supervisor-cannot-start-a-server.json`. This group used to write and remove that file
   * in this checkout itself. Two runs then wrote over each other's file, and a run beside a real dev
   * supervisor of this checkout would remove that supervisor's real file (problem x25LcNeJ7RFi). So
   * Vite starts from a copy of the files its configuration reads, in a temporary folder of this
   * group's own, and the cases write the trouble file there. The copy's vite.config.ts is this
   * checkout's, copied when the group starts, so a change to the middleware is still what is tested.
   */
  let copy = ''

  beforeAll(async () => {
    copy = mkdtempSync(join(tmpdir(), 'mole-office-supervisor-page-'))
    for (const part of ['vite.config.ts', 'src', 'package.json', 'tsconfig.json', 'for-agents/a-full-list-read.mjs']) {
      cpSync(join(REPO, part), join(copy, part), { recursive: true })
    }
    symlinkSync(join(REPO, 'node_modules'), join(copy, 'node_modules'))
    /**
     * NO WATCHER, NO REGISTRATION, AND A CACHE OF ITS OWN — the three things every Vite a test
     * starts needs, and each of them for a measured reason written down elsewhere.
     * `MOLE_OFFICE_NO_WATCH` is what tells the plugins in vite.config.ts that this Vite belongs to
     * a test: without it this one writes itself into the ledger and holds one of the 128 inotify
     * instances Linux allows a user. `MOLE_OFFICE_VITE_CACHE` keeps it off the cache the owner's
     * own Vite reads (problem `7n3NOgXhqux-`).
     */
    noWatchWas = process.env['MOLE_OFFICE_NO_WATCH']
    process.env['MOLE_OFFICE_NO_WATCH'] = '1'
    cacheDir = mkdtempSync(join(tmpdir(), 'mole-office-supervisor-vite-'))
    process.env['MOLE_OFFICE_VITE_CACHE'] = cacheDir
    const server = await aViteDevServer({
      configFile: join(copy, 'vite.config.ts'),
      logLevel: 'silent',
      server: { port: 0, strictPort: false, host: '127.0.0.1' },
      // No dependency scan: this group asks for one address and never for a page's modules. See the
      // removal in afterAll for why it matters.
      optimizeDeps: { noDiscovery: true, include: [] },
    })
    await server.listen()
    vite = server
    site = server.resolvedUrls?.local[0]?.replace(/\/$/, '') ?? ''
  }, 120_000)

  afterAll(async () => {
    await vite?.close()
    if (noWatchWas === undefined) delete process.env['MOLE_OFFICE_NO_WATCH']
    else process.env['MOLE_OFFICE_NO_WATCH'] = noWatchWas
    delete process.env['MOLE_OFFICE_VITE_CACHE']
    /**
     * REMOVED AT ONCE, BECAUSE NOTHING WRITES INTO IT AFTER `close()`. Measured 4 September 2026:
     * seven runs of this group left seven directories in /tmp, each holding one `deps_temp_…`
     * folder. Vite's dependency scan starts a bundling run when it ends without asking whether the
     * server has closed, and `close()` does not wait for that run, so the run wrote into the cache
     * after the removal. A half-second pause here hid it until 29 September 2026. The server above
     * now starts with no scan: Vite bundles only the dependencies the configuration names, and
     * `listen()` does not return until that is finished, so nothing is still writing when `close()`
     * is called (problem `ToxCUBqVhdPI`).
     */
    if (cacheDir !== '') rmSync(cacheDir, { recursive: true, force: true })
    if (copy !== '') rmSync(copy, { recursive: true, force: true })
  })

  it('answers 204 while the supervisor is starting servers normally, which is every ordinary minute', async () => {
    rmSync(theTroubleFileIn(copy), { force: true })
    const answered = await fetch(`${site}${THE_TROUBLE_ADDRESS}`, { signal: AbortSignal.timeout(10_000) })
    expect(answered.status).toBe(204)
  })

  it('hands over the count, the last exit and the sentence when there is a run of failures', async () => {
    mkdirSync(join(copy, '.logs'), { recursive: true })
    // Port 1 and a pid nothing here runs: a file no server will ever report, because each reads
    // only one about its own port. The middleware serves whatever is written.
    writeTheTrouble(copy, aRunOfFailures({ repository: copy, port: 1 }))
    try {
      const answered = await fetch(`${site}${THE_TROUBLE_ADDRESS}`, { signal: AbortSignal.timeout(10_000) })
      expect(answered.status).toBe(200)
      const said = (await answered.json()) as { says: string; failedStarts: number; supervisorPgid: number }
      expect(said.says).toContain('96 times in a row')
      expect(said.failedStarts).toBe(96)
      expect(said.supervisorPgid).toBe(845844)
    } finally {
      rmSync(theTroubleFileIn(copy), { force: true })
    }
  })

  it('answers 204 for one nothing has rewritten for two minutes, so a stopped supervisor stops shouting', async () => {
    mkdirSync(join(copy, '.logs'), { recursive: true })
    writeTheTrouble(copy, aRunOfFailures({ repository: copy, port: 1, atMs: Date.now() - 10 * 60 * 1000 }))
    try {
      const answered = await fetch(`${site}${THE_TROUBLE_ADDRESS}`, { signal: AbortSignal.timeout(10_000) })
      expect(answered.status).toBe(204)
    } finally {
      rmSync(theTroubleFileIn(copy), { force: true })
    }
  })
})

// ================================================ a real supervisor over a real checkout

/** What each act of the run saw. Filled in `beforeAll`; the tests below only read it. */
const seen: {
  restartsForTwoChangesInTheSameWindow: number
  addressInUse: number
  childrenAfterTwoChanges: number
  failedStartsAfterTwoChanges: number
  theChildWasGoneAfter: number | null
  thePortWasFreeAfterTheKill: boolean
  aStopByGroupLeftNothing: boolean
  theCrashLoopFile: { failedStarts: number; lastExit: string; lastOutput: readonly string[] } | null
  theCountGrewTo: number
  theFileWasNeverTakenBackMidLoop: boolean
  healthWhileFailing: { ok: boolean; wrong: string[] } | null
  recordWhileFailing: RuntimeRecord | null
  theFileWasTakenBack: boolean
  healthAfterRecovery: boolean | null
  theClockFoundIt: boolean
  lines: string[]
} = {
  restartsForTwoChangesInTheSameWindow: -1,
  addressInUse: -1,
  childrenAfterTwoChanges: -1,
  failedStartsAfterTwoChanges: -1,
  theChildWasGoneAfter: null,
  thePortWasFreeAfterTheKill: false,
  aStopByGroupLeftNothing: false,
  theCrashLoopFile: null,
  theCountGrewTo: -1,
  theFileWasNeverTakenBackMidLoop: false,
  healthWhileFailing: null,
  recordWhileFailing: null,
  theFileWasTakenBack: false,
  healthAfterRecovery: null,
  theClockFoundIt: false,
  lines: [],
}

let dir = ''
let api = ''
let port = 0
let supervisor: ChildProcess | null = null
let output = ''
let environment: NodeJS.ProcessEnv = {}

function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const probe = createServer()
    probe.on('error', fail)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      if (address === null || typeof address === 'string') {
        probe.close(() => {
          fail(new Error('the probe socket reported no port'))
        })
        return
      }
      const { port: got } = address
      probe.close(() => {
        done(got)
      })
    })
  })
}

function inTheCopy(command: string, args: string[]): void {
  const ran = spawnSync(command, args, { cwd: dir, encoding: 'utf8' })
  if (ran.status !== 0) throw new Error(`${command} ${args.join(' ')} failed in the copy: ${ran.stderr || ran.stdout}`)
}

/** Every child of the supervisor, so an extra process cannot hide behind its group. */
function itsChildren(of: number): string[] {
  const ran = spawnSync('ps', ['--ppid', String(of), '--no-headers', '-o', 'pid'], { encoding: 'utf8' })
  return ran.stdout.split('\n').map((one) => one.trim()).filter((one) => one !== '')
}

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function read(what: string): Promise<unknown | null> {
  try {
    const answered = await fetch(`${api}${what}`, {
      headers: { 'x-mole-office-workspace': 'default' },
      signal: AbortSignal.timeout(4000),
    })
    return await answered.json()
  } catch {
    return null
  }
}

/**
 * WAIT FOR THE RECORD TO NAME THIS SUPERVISOR, not merely for something to answer on the port.
 *
 * Measured on 4 September 2026 in a full suite run at load average 36:
 * tests/a-git-rewrite-does-not-stop-the-server-being-watched.test.ts read a runtime record whose
 * supervisor was `nothing that restarts it` and whose restart reason was null. That is what ANOTHER
 * test's server on the same port looks like — `freePort` closes its probe socket before the
 * supervisor binds, and under load a second `freePort` elsewhere can hand out the same number in
 * between. Waiting for the thing being measured turns that into a timeout that says so.
 */
async function untilItAnswers(within = 90_000): Promise<RuntimeRecord> {
  const stopAt = Date.now() + within
  let last: RuntimeRecord | null = null
  while (Date.now() < stopAt) {
    const got = (await read('/api/runtime')) as RuntimeRecord | null
    if (got !== null && got.process !== undefined) {
      last = got
      if (got.supervisor.watching === true && got.supervisor.restartedBecause !== null) return got
    }
    await sleep(250)
  }
  throw new Error(
    `no server under this supervisor answered on ${api} within ${String(within / 1000)}s. The last reading was ` +
      `${last === null ? 'nothing at all' : `pid ${String(last.process.pid)}, ${last.supervisor.says}`}.` +
      `\nThe supervisor said:\n${output}`,
  )
}

const linesSaying = (what: string): number => output.split('\n').filter((one) => one.includes(what)).length

/** Start a supervisor of its own over the copy, on a port of its own. For the two ways out. */
async function aSupervisorOfItsOwn(): Promise<{ pid: number; port: number; child: () => string[] }> {
  const its = await freePort()
  const watched = commandThatStopsWithItsOwner(process.execPath, ['tools/serve-dev.mjs'])
  const started = spawn(watched.command, watched.args, {
    cwd: dir,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...environment, MOLE_OFFICE_PORT: String(its), MOLE_OFFICE_DB: join(dir, `own-${String(its)}.db`) },
  })
  const pid = started.pid
  if (pid === undefined) throw new Error('the supervisor did not start')
  // THE SAME WAIT AS ABOVE, and for the same reason: a server answering here has to be one THIS
  // supervisor started, or the two acts below measure somebody else's process.
  const stopAt = Date.now() + 90_000
  let said = 'nothing at all'
  while (Date.now() < stopAt) {
    try {
      const answered = await fetch(`http://127.0.0.1:${String(its)}/api/runtime`, {
        headers: { 'x-mole-office-workspace': 'default' },
        signal: AbortSignal.timeout(2000),
      })
      const record = (await answered.json()) as RuntimeRecord
      said = record.supervisor?.says ?? 'nothing at all'
      if (record.supervisor?.watching === true && record.supervisor.pid === pid) break
    } catch {
      // Not up yet.
    }
    await sleep(250)
  }
  if (itsChildren(pid).length === 0) {
    throw new Error(`the supervisor on port ${String(its)} never started a server. The last reading said: ${said}`)
  }
  return { pid, port: its, child: () => itsChildren(pid) }
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'mole-office-supervisor-'))
  // src/config holds roles.json (copied with src), which the server reads before it serves and refuses to start
  // without (P3, P4): a copy of the program without it is not a program that starts.
  for (const part of ['src', 'tools', 'for-agents', 'drizzle', 'package.json', 'tsconfig.json']) {
    cpSync(join(REPO, part), join(dir, part), { recursive: true })
  }
  symlinkSync(join(REPO, 'node_modules'), join(dir, 'node_modules'))

  /**
   * THE FIXTURE. See the block at the top of this file: the race in the first act lives in the
   * window a child takes to stop, and on a copy that window is ninety milliseconds. This makes the
   * copy's server slow to stop while a marker file is there, and the act takes the marker away
   * afterwards so nothing else in this run pays for it.
   */
  appendFileSync(
    join(dir, 'src/server/index.ts'),
    [
      '',
      '// A FIXTURE, in a throwaway copy only: this server is slow to stop while the marker is there.',
      "import { existsSync as theMarkerIsThere } from 'node:fs'",
      "process.prependListener('SIGTERM', () => {",
      "  if (!theMarkerIsThere('.slow-to-stop')) return",
      '  const until = Date.now() + 3000',
      '  while (Date.now() < until) {',
      '    // Blocking the event loop on purpose.',
      '  }',
      '})',
      '',
    ].join('\n'),
  )

  // Only the throwaway supervisor's successful health probe is held. The real server and its
  // public health/runtime replies are unchanged. Aborting a probe keeps its existing timeout.
  appendFileSync(join(dir, 'tools/serve-dev.mjs'), `
    import { existsSync as fixtureMarkerIsThere, writeFileSync as fixtureWrite } from 'node:fs'
    const fixtureFetch = globalThis.fetch
    globalThis.fetch = async (...args) => {
      const response = await fixtureFetch(...args)
      if (String(args[0]).endsWith('/api/health') && response.status < 500 && fixtureMarkerIsThere('.hold-recovery-probe')) {
        fixtureWrite('.recovery-probe-held', 'The real server answered its supervisor.\\n')
        while (fixtureMarkerIsThere('.hold-recovery-probe')) {
          await new Promise(done => setTimeout(done, 10))
          args[1]?.signal?.throwIfAborted()
        }
      }
      return response
    }
  `)

  inTheCopy('git', ['init', '-q'])
  inTheCopy('git', ['add', '-A'])
  inTheCopy('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'the copy'])

  port = await freePort()
  api = `http://127.0.0.1:${String(port)}`
  environment = {
    ...withoutInheritedEffort(),
    MOLE_OFFICE_PORT: String(port),
    MOLE_OFFICE_DB: join(dir, 'watched.db'),
    MOLE_OFFICE_WORKSPACE: 'default',
    LOG_LEVEL: 'warn',
    // A clock of two seconds rather than a minute, so the fifth act does not wait one out. The
    // setting is what the supervisor reads; this is a test choosing a value for it.
    MOLE_OFFICE_CHECK_FOR_MISSED_CHANGES: '2',
    MOLE_OFFICE_TEST_SUPERVISOR_CLOCKS: JSON.stringify({ goodRun: 3000, firstBackoff: 100, longestBackoff: 4000 }),
    VITEST: undefined,
    VITEST_WORKER_ID: undefined,
  } as NodeJS.ProcessEnv

  // ------------------------------------------------------- ACT 1: TWO CHANGES IN THE SAME WINDOW
  writeFileSync(join(dir, '.slow-to-stop'), 'the server is slow to stop while this is here\n')
  const watched = commandThatStopsWithItsOwner(process.execPath, ['tools/serve-dev.mjs'])
  supervisor = spawn(watched.command, watched.args, {
    cwd: dir,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: environment,
  })
  supervisor.stdout?.on('data', (d: Buffer) => (output += d.toString()))
  supervisor.stderr?.on('data', (d: Buffer) => (output += d.toString()))
  const supervisorPid = supervisor.pid ?? 0
  await untilItAnswers()

  const product = join(dir, 'src/shared/product.ts')
  appendFileSync(product, '\n// the first change\n')
  // A second inside the first restart's window: the collecting window is 250ms and the child now
  // takes three seconds to stop, so this arrives while the first restart is still stopping it.
  await sleep(1000)
  appendFileSync(product, '\n// the second change, inside the first restart\n')
  await untilStandIn(() => linesSaying('[dev] restarting the server') >= 2, () => output, 90_000)
  await untilItAnswers()
  seen.restartsForTwoChangesInTheSameWindow = linesSaying('[dev] restarting the server')
  seen.addressInUse = linesSaying('EADDRINUSE')
  seen.childrenAfterTwoChanges = itsChildren(supervisorPid).length
  seen.failedStartsAfterTwoChanges = linesSaying('in a row')
  rmSync(join(dir, '.slow-to-stop'), { force: true })
  await untilItAnswers()

  // ------------------------------------------------- ACT 4: A RUN OF FAILED STARTS REACHES A PERSON
  // Done on this supervisor because it is the one whose ledger row and file the readings are about.
  appendFileSync(product, "\nthrow new Error('this server is made unable to start, on purpose')\n")
  const troubleFile = theTroubleFileIn(dir)
  const untilTheFile = Date.now() + 90_000
  while (Date.now() < untilTheFile && readTheTrouble(dir) === null) await sleep(500)
  const written = readTheTrouble(dir)
  seen.theCrashLoopFile =
    written === null ? null : { failedStarts: written.failedStarts, lastExit: written.lastExit, lastOutput: written.lastOutput }

  /**
   * THE COUNT GOES ON GROWING THROUGH A BACKOFF LONGER THAN A GOOD RUN.
   *
   * The test setting gives the health clock 3 s and backoffs of 0.1, 0.2, 0.4, 0.8,
   * 1.6 and 3.2 s before the seventh failure. The last wait still crosses the good-run
   * clock, so a timer left alive after its child exits would take the failure file back.
   */
  seen.theFileWasNeverTakenBackMidLoop = true
  const untilSeven = Date.now() + 150_000
  while (Date.now() < untilSeven) {
    const now = readTheTrouble(dir)
    if (now === null) {
      seen.theFileWasNeverTakenBackMidLoop = false
      break
    }
    seen.theCountGrewTo = now.failedStarts
    if (now.failedStarts >= 7) break
    await sleep(500)
  }

  // The recovery probe must be held while health and runtime read the failure state. A server
  // answering and a supervisor still reporting failed starts is one controlled state; two reads
  // racing the supervisor's successful health probe do not establish that state.
  const back = join(dir, 'src/shared/product.ts')
  const holdRecovery = join(dir, '.hold-recovery-probe')
  writeFileSync(holdRecovery, 'Read the failure state before accepting the recovery probe.\n')
  writeFileSync(back, String(spawnSync('git', ['show', 'HEAD:src/shared/product.ts'], { cwd: dir, encoding: 'utf8' }).stdout))
  try {
    await untilStandIn(() => existsSync(join(dir, '.recovery-probe-held')), () => output, 90_000)
    const health = (await read('/api/health')) as { ok: boolean; wrong?: string[] } | null
    seen.healthWhileFailing = health === null ? null : { ok: health.ok, wrong: health.wrong ?? [] }
    seen.recordWhileFailing = (await read('/api/runtime')) as RuntimeRecord | null
  } finally { rmSync(holdRecovery, { force: true }) }
  // And once a run has lasted, the file is taken back and the reading goes with it.
  await untilStandIn(() => !existsSync(troubleFile), () => output, 30_000)
  seen.theFileWasTakenBack = !existsSync(troubleFile)
  const after = (await read('/api/health')) as { ok: boolean } | null
  seen.healthAfterRecovery = after?.ok ?? null

  // ------------------------------------------------------ ACT 5: A CHANGE NOBODY SAW, FOUND BY THE CLOCK
  /**
   * THE CHANGE IS MADE BY MOVING A FILE'S TIME FORWARD, and this says so rather than pretending an
   * event was dropped. What the clock exists to find is a state — a file the server was built from
   * is newer than the server that is running — and there is no way to make the kernel drop an
   * event on demand. Moving the time forward puts the process in exactly that state.
   */
  const settled = await untilItAnswers()
  const aheadBy = new Date(Date.now() + 60 * 60 * 1000)
  spawnSync('touch', ['-d', aheadBy.toISOString(), join(dir, 'src/shared/product.ts')])
  const untilTheClock = Date.now() + 60_000
  while (Date.now() < untilTheClock && !output.includes('a change nobody saw')) await sleep(500)
  seen.theClockFoundIt = output.includes('a change nobody saw: src/shared/product.ts')
  spawnSync('touch', [join(dir, 'src/shared/product.ts')])
  void settled

  seen.lines = output.split('\n').filter((one) => one.startsWith('[dev]'))

  // ------------------------------------------------------------- ACT 2: A SIGKILL ON THE SUPERVISOR
  const killed = await aSupervisorOfItsOwn()
  const itsChild = Number(killed.child()[0] ?? 0)
  expect(itsChild, 'the supervisor of act 2 never started a server').toBeGreaterThan(0)
  const at = Date.now()
  process.kill(killed.pid, 'SIGKILL')
  while (Date.now() - at < 15_000) {
    if (!isRunning(itsChild)) {
      seen.theChildWasGoneAfter = Date.now() - at
      break
    }
    await sleep(50)
  }
  await sleep(500)
  seen.thePortWasFreeAfterTheKill = ((await freePortIsTheSameAs(killed.port)) as boolean)

  // ------------------------------------------------------------ ACT 3: A STOP BY THE SUPERVISOR'S GROUP
  const byGroup = await aSupervisorOfItsOwn()
  const groupsChild = Number(byGroup.child()[0] ?? 0)
  expect(groupsChild, 'the supervisor of act 3 never started a server').toBeGreaterThan(0)
  process.kill(-byGroup.pid, 'SIGTERM')
  const untilBothAreGone = Date.now() + 15_000
  while (Date.now() < untilBothAreGone && (isRunning(byGroup.pid) || isRunning(groupsChild))) await sleep(100)
  seen.aStopByGroupLeftNothing = !isRunning(byGroup.pid) && !isRunning(groupsChild)
}, 420_000)

/** Whether this port is free again, asked of the kernel by trying to bind it. */
async function freePortIsTheSameAs(which: number): Promise<boolean> {
  return await new Promise((done) => {
    const probe = createServer()
    probe.on('error', () => {
      done(false)
    })
    probe.listen(which, '127.0.0.1', () => {
      probe.close(() => {
        done(true)
      })
    })
  })
}

afterAll(async () => {
  if (supervisor?.pid !== undefined && supervisor.pid !== null) {
    try {
      process.kill(-supervisor.pid, 'SIGTERM')
    } catch {
      // Already gone, which is the outcome that was wanted.
    }
    const untilItsGroupIsGone = Date.now() + 3000
    while (Date.now() < untilItsGroupIsGone && isRunning(-supervisor.pid)) await sleep(100)
    try {
      process.kill(-supervisor.pid, 'SIGKILL')
    } catch {
      // Gone, as asked.
    }
  }
  if (dir !== '') rmSync(dir, { recursive: true, force: true })
})

describe('two changes in one restart window are one restart, and never two servers', () => {
  it('started no second server, so nothing ever fought for the port', () => {
    expect(seen.addressInUse, `EADDRINUSE in the supervisor's own output:\n${seen.lines.join('\n')}`).toBe(0)
  })

  it('has exactly one child at the end of it', () => {
    expect(seen.childrenAfterTwoChanges).toBe(1)
  })

  it('did not start a run of failed starts, which is what a lost child turns into', () => {
    expect(seen.failedStartsAfterTwoChanges).toBe(0)
  })

  it('restarted for both changes rather than swallowing the second', () => {
    expect(seen.restartsForTwoChangesInTheSameWindow).toBeGreaterThanOrEqual(2)
  })
})

describe('the server goes when the supervisor goes, however the supervisor goes', () => {
  it('is gone within two seconds of a SIGKILL on the supervisor, which runs no handler at all', () => {
    expect(seen.theChildWasGoneAfter, 'the server outlived a SIGKILL on the supervisor').not.toBeNull()
    expect(seen.theChildWasGoneAfter ?? Infinity).toBeLessThan(2000)
  })

  it('gives the port back', () => {
    expect(seen.thePortWasFreeAfterTheKill).toBe(true)
  })

  it('goes with a stop of the supervisor’s group, which it is not in', () => {
    expect(seen.aStopByGroupLeftNothing).toBe(true)
  })
})

describe('a run of failed starts reaches the runtime record, health and a file', () => {
  it('is written down, with the last exit and the last lines the server printed', () => {
    expect(seen.theCrashLoopFile).not.toBeNull()
    expect(seen.theCrashLoopFile?.failedStarts).toBeGreaterThanOrEqual(3)
    expect(seen.theCrashLoopFile?.lastExit).toBe('exit code 1')
    expect(seen.theCrashLoopFile?.lastOutput.join('\n')).toContain('made unable to start')
  })

  it('makes GET /api/health answer ok false while a server is answering perfectly', () => {
    expect(seen.healthWhileFailing).not.toBeNull()
    expect(seen.healthWhileFailing?.ok).toBe(false)
    expect(seen.healthWhileFailing?.wrong.join(' ')).toContain('failed to start a fresh server')
  })

  it('is on the runtime record’s supervisor section, in words and in numbers', () => {
    expect(seen.recordWhileFailing?.supervisor.failedStarts?.count).toBeGreaterThanOrEqual(3)
    expect(seen.recordWhileFailing?.supervisor.says).toContain('failed to start a fresh server')
  })

  it('goes on counting through a wait longer than a good run, rather than clearing itself', () => {
    expect(seen.theCountGrewTo).toBeGreaterThanOrEqual(7)
    expect(seen.theFileWasNeverTakenBackMidLoop).toBe(true)
  })

  it('is taken back once a server has been up for ten seconds, and health goes green with it', () => {
    expect(seen.theFileWasTakenBack).toBe(true)
    expect(seen.healthAfterRecovery).toBe(true)
  })
})

describe('a change no watch reported is found by the clock and named as one', () => {
  it('restarts, and the reason says nobody saw it', () => {
    expect(seen.theClockFoundIt, `the supervisor said:\n${seen.lines.join('\n')}`).toBe(true)
  })
})
