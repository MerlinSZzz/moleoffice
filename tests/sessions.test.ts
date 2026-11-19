// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SESSION REGISTRY, TESTED AGAINST A MACHINE THAT IS DESCRIBED RATHER THAN SAMPLED.
 *
 * Every test here builds a home directory of real JSONL transcripts, a fixed clock, and a process
 * list with exactly what it wants in it. That is the only way this module can be tested at all:
 * its whole subject is "is this session still alive", and a test that read the real /proc would
 * assert whatever happened to be running that afternoon. `orphaned` and `crashed` would then be
 * states that only ever occur in production, which is precisely where they must not be discovered
 * for the first time.
 *
 * THE PROPERTY THAT MATTERS MOST is the one in "never claims a session finished". Claude Code
 * writes no end-of-session marker -- verified by counting every line type across all 35
 * transcripts on this machine while the adapter was written -- so a clean exit and a `kill -9`
 * leave byte-identical files. A wrong "finished" on a crashed session is exactly the silence
 * Mole Office exists to remove, so no arrangement of evidence may produce that word.
 */

import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import Fastify, { type FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { THE_TEST_FIXTURE_ROOT, THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { aRealFolderNamed, freshDb, one, theProjectHoldsThisFolder, type TestDb } from './helpers.ts'
import { LINK_TYPES } from '../src/shared/types.ts'
import { OBSERVED_SESSION_STATES } from '../src/server/lib/adapters/types.ts'
import type { AdapterEnv, ProcessInfo, ProcessScan } from '../src/server/lib/adapters/types.ts'
import { DISCOVERY_KEY } from '../src/shared/discovery-stamp.ts'

// -------------------------------------------------------------------------------- the machine

/** Every "how long ago" in this file is measured against this moment. */
const NOW = new Date('2026-08-08T12:00:00Z')

const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString()
const hoursAgo = (h: number) => minutesAgo(h * 60)

/** The directory name Claude Code would use for the invented fixture folder. */
const PROJECT_SLUG = `${THE_TEST_FIXTURE_ROOT.replaceAll('/', '-')}-test-claude`
/**
 * THE FOLDER THE CONVERSATIONS IN THIS FILE RAN IN: a real one, which the test project holds. Discovery files a
 * conversation into the project that holds its working directory (problem kDKj9iXd4Vft), and a project holds only a
 * folder that exists, so it is registered as a repository root of `default` after each fresh database. Its last name
 * is still test_claude.
 */
const REAL_CWD = aRealFolderNamed('test_claude')
afterAll(() => { rmSync(dirname(REAL_CWD), { recursive: true, force: true }) })

let home: string
let db: TestDb
type SessionsLib = typeof import('../src/server/lib/sessions.ts')
let sessions: SessionsLib

/**
 * A DATABASE AND THE SESSIONS MODULE THAT READS IT. Cases that only read share one for their group
 * (`oneDatabaseForThisGroup`); cases that write make one each (`aFreshDatabaseForThisCase`). The
 * made-up home folder is new for every case either way, because a transcript written by one case
 * must not be found by the next.
 *
 * EACH DATABASE IS CLOSED WHEN WHAT IT WAS MADE FOR ENDS: a group's after the group, a case's after
 * the case (round 83). A case's database was left open until then. Measured on 25 October 2026, the
 * file's process held 1,864 MB after its last case that way and 831 MB with each closed. The file had
 * gone red on the merge queue with "Worker exited unexpectedly" while all 77 cases passed; that log
 * names no signal and no lack of memory, so nothing proves what ended the worker.
 */
async function aFreshDatabase(): Promise<void> {
  db = await freshDb()
  await theProjectHoldsThisFolder('default', REAL_CWD)
  sessions = await import('../src/server/lib/sessions.ts')
}

function aFreshDatabaseForThisCase(): void {
  beforeEach(aFreshDatabase)
  afterEach(() => db.close())
}

function oneDatabaseForThisGroup(): void {
  beforeAll(aFreshDatabase)
  afterAll(() => db.close())
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'mole-office-home-'))
})

afterEach(() => {
  rmSync(home, { recursive: true, force: true })
})

/** Write one transcript, exactly as Claude Code lays them out, and hand back its path. */
function writeLog(
  id: string,
  entries: unknown[],
  opts: { project?: string; mtime?: Date } = {},
): string {
  const dir = join(home, '.claude', 'projects', opts.project ?? PROJECT_SLUG)
  mkdirSync(dir, { recursive: true })
  const path = join(dir, `${id}.jsonl`)
  writeFileSync(path, entries.map((e) => JSON.stringify(e)).join('\n') + '\n')
  if (opts.mtime) utimesSync(path, opts.mtime, opts.mtime)
  return path
}

/** A line as a person typed it. This is what becomes the session's purpose and its name. */
const prompt = (text: string, at: string, cwd: string | null = REAL_CWD) => ({
  parentUuid: null,
  isSidechain: false,
  type: 'user',
  message: { role: 'user', content: text },
  timestamp: at,
  userType: 'external',
  entrypoint: 'cli',
  ...(cwd === null ? {} : { cwd }),
  version: '2.1.223',
})

/** A line the agent said. */
const said = (text: string, at: string) => ({
  type: 'assistant',
  isSidechain: false,
  message: { role: 'assistant', content: [{ type: 'text', text }] },
  timestamp: at,
  cwd: REAL_CWD,
})

/** A line where the agent used a tool. */
const used = (name: string, input: Record<string, unknown>, at: string) => ({
  type: 'assistant',
  isSidechain: false,
  message: { role: 'assistant', content: [{ type: 'tool_use', name, input }] },
  timestamp: at,
  cwd: REAL_CWD,
})

/** The line an API failure leaves behind. */
const apiError = (text: string, at: string) => ({
  type: 'assistant',
  isSidechain: false,
  isApiErrorMessage: true,
  apiErrorStatus: 529,
  message: { role: 'assistant', content: [{ type: 'text', text }] },
  timestamp: at,
  cwd: REAL_CWD,
})

/** A live Claude Code process, as its command line really reads on this machine. */
const liveProcess = (pid: number, id: string, extra = ''): ProcessInfo => ({
  pid,
  command: `${THE_TEST_FIXTURE_ROOT}/.local/share/claude/versions/2.1.223 --session-id ${id} ${extra}`.trim(),
  cwd: REAL_CWD,
})

function envWith(opts: { processes?: ProcessInfo[]; scanFails?: string; now?: Date } = {}): AdapterEnv {
  return {
    homeDir: home,
    now: opts.now ?? NOW,
    scanProcesses: () =>
      opts.scanFails !== undefined
        ? { ok: false, reason: opts.scanFails }
        : { ok: true, processes: opts.processes ?? [] },
    runningWithinSeconds: 5 * 60,
    orphanAfterSeconds: 6 * 60 * 60,
  }
}

/** The one session the machine holds, or a failure naming how many there really were. */
function onlySession(env: AdapterEnv) {
  return one(sessions.listSessions('default', env), 'session')
}

// ================================================================================ the ladder

describe('the state ladder derives what is observable and refuses to guess the rest', () => {
  oneDatabaseForThisGroup()

  it('is running when a process names it and the log is still growing', () => {
    const id = 'aaaaaaaa-0000-0000-0000-000000000001'
    writeLog(id, [prompt('fix the gripper calibration', hoursAgo(2)), said('on it', minutesAgo(1))])

    const view = onlySession(envWith({ processes: [liveProcess(4242, id)] }))

    expect(view.state).toBe('running')
    expect(view.pid).toBe(4242)
    expect(view.stateReason).toContain('process 4242')
  })

  it('is idle when the process is alive but the log has gone quiet', () => {
    const id = 'aaaaaaaa-0000-0000-0000-000000000002'
    writeLog(id, [prompt('run the sweep', hoursAgo(3)), said('waiting for your answer', minutesAgo(40))])

    const view = onlySession(envWith({ processes: [liveProcess(77, id)] }))

    expect(view.state).toBe('idle')
    expect(view.stateReason).toContain('waiting on you')
  })

  it('is crashed when no process holds it and the log ends on an error', () => {
    const id = 'aaaaaaaa-0000-0000-0000-000000000003'
    writeLog(id, [
      prompt('collate the force tables', hoursAgo(9)),
      said('reading the third print', hoursAgo(8)),
      apiError('Overloaded', hoursAgo(8)),
    ])

    const view = onlySession(envWith())

    expect(view.state).toBe('crashed')
    expect(view.stateReason).toContain('API error')
    expect(view.stateReason).toContain('529')
  })

  it('is NOT crashed when the error was survived and work carried on', () => {
    const id = 'aaaaaaaa-0000-0000-0000-000000000004'
    writeLog(id, [
      prompt('collate the force tables', hoursAgo(9)),
      apiError('Overloaded', hoursAgo(9)),
      said('retried, and the tables are done', hoursAgo(8)),
    ])

    const view = onlySession(envWith())

    // A bad minute in the middle of a session that carried on for another hour is not a bad
    // ending, and a red row on the alarm panel for it is a false alarm.
    expect(view.state).not.toBe('crashed')
    expect(view.state).toBe('orphaned')
  })

  it('is orphaned when nothing holds it and it has been quiet for a long time', () => {
    const id = 'aaaaaaaa-0000-0000-0000-000000000005'
    writeLog(id, [prompt('tidy the drizzle migrations', hoursAgo(30)), said('done', hoursAgo(29))])

    const view = onlySession(envWith())

    expect(view.state).toBe('orphaned')
    // The reason has to say WHY it is not "finished", or a reader will assume it means finished.
    expect(view.stateReason).toContain('no end-of-session marker')
  })

  it('is unknown, not orphaned, when the log is warm but no process names it', () => {
    // A session started as a bare `claude` carries its id nowhere a watcher can read. It is almost
    // certainly alive; "running" would be a claim we cannot back, and "orphaned" would be wrong.
    const id = 'aaaaaaaa-0000-0000-0000-000000000006'
    writeLog(id, [prompt('watch the training run', minutesAgo(20)), said('epoch 4', minutesAgo(2))])

    const view = onlySession(envWith())

    expect(view.state).toBe('unknown')
    expect(view.stateReason).toContain('bare `claude`')
  })

  it('is unknown in the gap between "recently noisy" and "long abandoned"', () => {
    const id = 'aaaaaaaa-0000-0000-0000-000000000007'
    writeLog(id, [prompt('probe the sensor', hoursAgo(2)), said('idle-ish', hoursAgo(1))])

    expect(onlySession(envWith()).state).toBe('unknown')
  })

  it('is unknown for everything when the process table cannot be read, however old the log', () => {
    // "I could not look" and "I looked and it is not there" are opposite conclusions. Collapsing
    // them would mark every live session on the machine as orphaned the first time /proc failed.
    const id = 'aaaaaaaa-0000-0000-0000-000000000008'
    writeLog(id, [prompt('anything', hoursAgo(48)), said('quiet for two days', hoursAgo(48))])

    const view = onlySession(envWith({ scanFails: '/proc could not be listed (ENOENT)' }))

    expect(view.state).toBe('unknown')
    expect(view.stateReason).toContain('could not be listed')
  })

  it('falls back to the file mtime when the log carries no clock of its own', () => {
    const id = 'aaaaaaaa-0000-0000-0000-000000000009'
    // Bookkeeping lines only: real transcripts open with these and they carry no timestamp.
    writeLog(id, [{ type: 'mode', mode: 'normal', sessionId: id }], {
      mtime: new Date(NOW.getTime() - 30 * 60 * 60 * 1000),
    })

    expect(onlySession(envWith()).state).toBe('orphaned')
  })
})

// ================================================================ the property that matters most

describe('never claims a session finished', () => {
  aFreshDatabaseForThisCase()

  it('reports no adapter as able to see a clean exit', async () => {
    const { claudeCodeAdapter } = await import('../src/server/lib/adapters/claude-code.ts')
    // Claude Code writes no ending, so nothing may ever earn the word. If a future version starts
    // writing one, this flag flips deliberately and with evidence, rather than by accident.
    expect(claudeCodeAdapter.reportsCleanExit).toBe(false)
  })

  it('produces no "finished" from any arrangement of evidence', () => {
    writeLog('bbbbbbbb-0000-0000-0000-00000000000a', [prompt('a', minutesAgo(1)), said('b', minutesAgo(1))])
    writeLog('bbbbbbbb-0000-0000-0000-00000000000b', [prompt('a', hoursAgo(99)), said('all done!', hoursAgo(99))])
    writeLog('bbbbbbbb-0000-0000-0000-00000000000c', [prompt('a', hoursAgo(9)), apiError('boom', hoursAgo(9))])
    writeLog('bbbbbbbb-0000-0000-0000-00000000000d', [{ type: 'mode', mode: 'normal' }])
    writeLog('bbbbbbbb-0000-0000-0000-00000000000e', [prompt('a', hoursAgo(2)), said('goodbye', hoursAgo(2))])

    for (const env of [
      envWith(),
      envWith({ processes: [liveProcess(1, 'bbbbbbbb-0000-0000-0000-00000000000a')] }),
      envWith({ scanFails: 'no /proc' }),
      envWith({ now: new Date(NOW.getTime() + 1000 * 60 * 60 * 24 * 30) }),
    ]) {
      const found = sessions.listSessions('default', env)
      expect(found).toHaveLength(5)
      expect(found.filter((s) => s.state === 'finished')).toEqual([])
    }
  })

  it('never stores a state a session record may not hold', () => {
    writeLog('bbbbbbbb-0000-0000-0000-00000000000f', [prompt('a', hoursAgo(30)), said('b', hoursAgo(30))])
    const env = envWith()

    sessions.syncSessions({ type: 'agent', id: 'test' }, 'default', env)
    const record = one(db.api.listRecords({ workspaceId: 'default', kind: 'session' }), 'session record')

    // orphaned has nowhere to live in `data.state`, so the key is absent rather than mapped onto
    // a word we have no evidence for.
    expect(record.data['state']).toBe('orphaned')
    const stamp = sessions.stampOf(record)
    expect(stamp?.observedState).toBe('orphaned')
    // ...and the record therefore reads as incomplete, which is how attention.ts already draws a
    // session with no readable state as a PROBLEM rather than hiding it.
    expect(db.api.incompletenessOf(record).map((i) => i.path)).not.toContain('data.state')
  })
})

// ============================================================================== the fork trap

describe('matching a session to a live process', () => {
  oneDatabaseForThisGroup()

  const forked = 'cccccccc-0000-0000-0000-000000000001'
  const source = 'cccccccc-0000-0000-0000-000000000002'

  function twoSessions() {
    writeLog(forked, [prompt('the forked session', minutesAgo(10)), said('working', minutesAgo(1))])
    writeLog(source, [prompt('the session it forked from', hoursAgo(20)), said('old', hoursAgo(20))])
  }

  it('reads --session-id as the live session and --resume as merely its ancestor', () => {
    twoSessions()
    // The real command line observed on this machine: it names two sessions and only one is alive.
    const proc: ProcessInfo = {
      pid: 152828,
      command:
        `${THE_TEST_FIXTURE_ROOT}/.local/share/claude/versions/2.1.223 --session-id ${forked} --fork-session ` +
        `--resume ${THE_TEST_FIXTURE_ROOT}/.claude/projects/${PROJECT_SLUG}/${source}.jsonl --effort xhigh`,
      cwd: REAL_CWD,
    }

    const found = sessions.listSessions('default', envWith({ processes: [proc] }))
    const live = found.find((s) => s.externalId === forked)
    const ancestor = found.find((s) => s.externalId === source)

    expect(live?.state).toBe('running')
    expect(live?.pid).toBe(152828)
    // Reading every --resume as a claim would have shown this dead session as green for as long
    // as its child lived.
    expect(ancestor?.state).toBe('orphaned')
    expect(ancestor?.pid).toBeNull()
  })

  it('does read a plain --resume as a claim, when nothing contradicts it', () => {
    twoSessions()
    const proc: ProcessInfo = {
      pid: 9001,
      command: `${THE_TEST_FIXTURE_ROOT}/.local/bin/claude --resume ${THE_TEST_FIXTURE_ROOT}/.claude/projects/${PROJECT_SLUG}/${source}.jsonl`,
      cwd: REAL_CWD,
    }

    const found = sessions.listSessions('default', envWith({ processes: [proc] }))
    expect(found.find((s) => s.externalId === source)?.state).toBe('idle')
  })

  it('prefers the agent process over the pty host that wraps it', () => {
    twoSessions()
    const found = sessions.listSessions('default', 
      envWith({
        processes: [
          { pid: 111, command: `claude bg-pty-host --bg-pty-host /tmp/x.sock -- --session-id ${forked}`, cwd: null },
          liveProcess(222, forked),
        ],
      }),
    )
    expect(found.find((s) => s.externalId === forked)?.pid).toBe(222)
  })
})

// ============================================================================ reading the log

describe('what the adapter reads out of a transcript', () => {
  oneDatabaseForThisGroup()

  it('takes the working directory from the log, never from the directory name', () => {
    // The directory name flattens every / and _ to -, so `-srv-my-project` could be
    // /srv/my_project or /srv/my-project. It is not invertible and is not guessed.
    const id = 'dddddddd-0000-0000-0000-000000000001'
    writeLog(id, [prompt('hello', hoursAgo(1))])

    expect(onlySession(envWith()).cwd).toBe(REAL_CWD)
  })

  it('leaves the working directory null rather than inventing one from the slug', () => {
    const id = 'dddddddd-0000-0000-0000-000000000002'
    writeLog(id, [prompt('hello', hoursAgo(1), null)])

    const view = onlySession(envWith())
    expect(view.cwd).toBeNull()
    // ...and the resume command drops the `cd` rather than starting you in the wrong directory.
    expect(view.resumeCommand).toBe(`claude --resume ${id}`)
  })

  it('builds a resume command that lands in the right directory, quoted', () => {
    const id = 'dddddddd-0000-0000-0000-000000000003'
    writeLog(id, [prompt('hello', hoursAgo(1), `${THE_TEST_FIXTURE_ROOT}/it's here`)])

    expect(onlySession(envWith()).resumeCommand).toBe(`cd '${THE_TEST_FIXTURE_ROOT}/it'\\''s here' && claude --resume ${id}`)
  })

  it('takes the purpose from the opening request and skips the command banners', () => {
    const id = 'dddddddd-0000-0000-0000-000000000004'
    writeLog(id, [
      prompt('<local-command-caveat>Caveat: ignore this</local-command-caveat>', hoursAgo(3)),
      prompt('<command-name>/model</command-name>', hoursAgo(3)),
      prompt('rewrite the gripper calibration so it stops drifting', hoursAgo(3)),
      said('starting', hoursAgo(2)),
    ])

    expect(onlySession(envWith()).purpose).toBe('rewrite the gripper calibration so it stops drifting')
  })

  it('prefers a title somebody gave the session over its opening request', () => {
    const id = 'dddddddd-0000-0000-0000-000000000005'
    writeLog(id, [
      prompt('some very long opening request nobody wants as a title', hoursAgo(3)),
      { type: 'ai-title', aiTitle: 'Tray clamp calibration drift', sessionId: id },
      { type: 'custom-title', customTitle: 'gripper-drift', sessionId: id },
    ])

    expect(onlySession(envWith()).name).toBe('gripper-drift')
  })

  it('lists the files it worked on, most recently touched first, and says if that list is bounded', () => {
    const id = 'dddddddd-0000-0000-0000-000000000006'
    writeLog(id, [
      prompt('edit things', hoursAgo(3)),
      used('Read', { file_path: '/a/one.ts' }, hoursAgo(3)),
      used('Edit', { file_path: '/a/two.ts' }, hoursAgo(2)),
      used('Bash', { command: 'ls' }, hoursAgo(2)),
      used('Write', { file_path: '/a/one.ts' }, hoursAgo(1)),
    ])

    const view = onlySession(envWith())
    expect(view.filesTouched.paths).toEqual(['/a/one.ts', '/a/two.ts'])
    // A short log is read whole, so the list is the whole story and says so.
    expect(view.filesTouched.complete).toBe(true)
    expect(view.doing).toBe('Write: /a/one.ts')
  })

  it('reports what it was saying in preference to what it was running', () => {
    const id = 'dddddddd-0000-0000-0000-000000000007'
    writeLog(id, [prompt('go', hoursAgo(3)), used('Bash', { command: 'make' }, hoursAgo(2)), said('the build is green', hoursAgo(1))])

    expect(onlySession(envWith()).doing).toBe('the build is green')
  })
})

// ================================================================================ the tail

describe('reading the tail of a session log', () => {
  aFreshDatabaseForThisCase()

  it('hands back the last N lines, oldest first, numbered from the end', () => {
    const id = 'eeeeeeee-0000-0000-0000-000000000001'
    writeLog(id, [
      prompt('one', hoursAgo(5)),
      said('two', hoursAgo(4)),
      said('three', hoursAgo(3)),
      said('four', hoursAgo(2)),
    ])

    const tail = sessions.readSessionTail(onlySession(envWith()), 2)

    expect(tail.available).toBe(true)
    expect(tail.lines.map((l) => l.text)).toEqual(['three', 'four'])
    expect(tail.lines.map((l) => l.fromEnd)).toEqual([2, 1])
    expect(tail.lines[0]?.at).not.toBeNull()
  })

  it('shows a half-written last line rather than dropping it', () => {
    // Normal in a log being appended to right now. A watcher wondering why the newest line is
    // missing is worse served than one who can see it arriving.
    const id = 'eeeeeeee-0000-0000-0000-000000000002'
    const dir = join(home, '.claude', 'projects', PROJECT_SLUG)
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(dir, `${id}.jsonl`),
      `${JSON.stringify(prompt('one', hoursAgo(2)))}\n{"type":"assist`,
    )

    const tail = sessions.readSessionTail(onlySession(envWith()), 10)
    const last = tail.lines[tail.lines.length - 1]
    expect(last?.kind).toBe('unparseable')
    expect(last?.text).toContain('still being written')
    expect(last?.raw).toBe('{"type":"assist')
  })

  it('says why there is no tail rather than answering with an empty success', () => {
    const record = db.api.createRecord({ workspaceId: 'default',
      kind: 'session',
      title: 'a session somebody typed in',
      data: { state: 'crashed', runtime: 'claude-code' },
      actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id },
    })

    const view = sessions.getSession(record.id, 'default', envWith())
    expect(view).not.toBeNull()
    const tail = sessions.readSessionTail(view!, 10)

    expect(tail.available).toBe(false)
    expect(tail.lines).toEqual([])
    expect(tail.reason).toContain('no log path')
  })

  it('caps a line that is too long to draw, and says it capped it', () => {
    const id = 'eeeeeeee-0000-0000-0000-000000000003'
    writeLog(id, [prompt('go', hoursAgo(2)), said('x'.repeat(9000), hoursAgo(1))])

    const tail = sessions.readSessionTail(onlySession(envWith()), 5)
    const last = tail.lines[tail.lines.length - 1]
    expect(last?.rawTruncated).toBe(true)
    expect(last?.rawLength).toBeGreaterThan(9000)
    expect(last?.raw.length).toBeLessThan(4100)
  })
})

// ====================================================== records, idempotence, and human edits

describe('discovery fills records in without standing on anything a person wrote', () => {
  aFreshDatabaseForThisCase()

  const id = 'ffffffff-0000-0000-0000-000000000001'

  /**
   * One discovered session. `lastAt` moves its final line, which is what decides `running` from
   * `idle` when a process is alive — the state ladder reads the log's clock, not just the process.
   */
  function discovered(lastAt = hoursAgo(19)) {
    writeLog(id, [
      prompt('make the wrist camera stop dropping frames', hoursAgo(20)),
      used('Edit', { file_path: '/proj/camera.ts' }, hoursAgo(19)),
      said('reduced the exposure', lastAt),
    ])
  }

  const AGENT = { type: 'agent', id: 'claude-code' } as const

  it('creates one record the first time and writes nothing the second', () => {
    discovered()
    const env = envWith()

    const first = sessions.syncSessions(AGENT, 'default', env)
    expect(first.discovered).toBe(1)
    expect(first.created).toBe(1)

    const record = one(db.api.listRecords({ workspaceId: 'default', kind: 'session' }), 'session record')
    const updatedAt = record.updatedAt

    const second = sessions.syncSessions(AGENT, 'default', env)
    expect(second.created).toBe(0)
    expect(second.updated).toBe(0)
    expect(second.unchanged).toBe(1)

    // Idempotent all the way down: not even the timestamp moved, so a sweep on a loop does not
    // reorder the home page or fill the change log with noise.
    const after = one(db.api.listRecords({ workspaceId: 'default', kind: 'session' }), 'session record')
    expect(after.updatedAt).toBe(updatedAt)
    expect(after.id).toBe(record.id)
  })

  it('never overwrites a renamed title or a rewritten purpose', () => {
    discovered()
    const env = envWith()
    sessions.syncSessions(AGENT, 'default', env)
    const record = one(db.api.listRecords({ workspaceId: 'default', kind: 'session' }), 'session record')

    db.api.updateRecord(
      record.id,
      { title: 'wrist camera frame drops', summary: 'the real reason: the USB hub, not the exposure' },
      { type: 'human', id: THE_TEST_OFFICES_OWNER.id },
    )

    sessions.syncSessions(AGENT, 'default', env)
    sessions.syncSessions(AGENT, 'default', envWith({ processes: [liveProcess(5, id)] }))

    const after = one(db.api.listRecords({ workspaceId: 'default', kind: 'session' }), 'session record')
    expect(after.title).toBe('wrist camera frame drops')
    expect(after.summary).toBe('the real reason: the USB hub, not the exposure')
  })

  it('leaves a human\'s own notes in `extra` alone while replacing its own stamp', () => {
    discovered(minutesAgo(1))
    const env = envWith()
    sessions.syncSessions(AGENT, 'default', env)
    const record = one(db.api.listRecords({ workspaceId: 'default', kind: 'session' }), 'session record')

    db.api.patchRecord(
      record.id,
      { dataPatch: { extra: { rig: 'bench jig 2', operator: THE_TEST_OFFICES_OWNER.id } } },
      { type: 'human', id: THE_TEST_OFFICES_OWNER.id },
    )

    sessions.syncSessions(AGENT, 'default', envWith({ processes: [liveProcess(5, id)] }))

    const after = one(db.api.listRecords({ workspaceId: 'default', kind: 'session' }), 'session record')
    const extra = after.data['extra'] as Record<string, unknown>
    expect(extra['rig']).toBe('bench jig 2')
    expect(extra['operator']).toBe(THE_TEST_OFFICES_OWNER.id)
    expect(sessions.stampOf(after)?.observedState).toBe('running')
  })

  // Problem o-P0QezZ5bM8: a sweep wrote the transcript's last line over the doing line an agent set.
  it('never overwrites a doing line the agent set, however the transcript moves', () => {
    discovered()
    sessions.syncSessions(AGENT, 'default', envWith())
    const record = one(db.api.listRecords({ workspaceId: 'default', kind: 'session' }), 'session record')
    expect(record.data['doing']).toBe('reduced the exposure')

    db.api.patchRecord(
      record.id,
      { dataPatch: { doing: 'measuring frame drops at three exposures' } },
      { type: 'agent', id: 'claude-code' },
    )
    // The transcript moves on, so the sweep's reading is new words.
    writeLog(id, [
      prompt('make the wrist camera stop dropping frames', hoursAgo(20)),
      used('Edit', { file_path: '/proj/camera.ts' }, hoursAgo(19)),
      said('reduced the exposure', hoursAgo(19)),
      said('the hub is the cause, not the exposure', minutesAgo(1)),
    ])
    sessions.syncSessions(AGENT, 'default', envWith({ processes: [liveProcess(5, id)] }))
    sessions.syncSessions(AGENT, 'default', envWith())

    const after = one(db.api.listRecords({ workspaceId: 'default', kind: 'session' }), 'session record')
    expect(after.data['doing']).toBe('measuring frame drops at three exposures')
  })

  it('keeps refreshing a doing line that discovery wrote itself', () => {
    discovered()
    sessions.syncSessions(AGENT, 'default', envWith())
    writeLog(id, [
      prompt('make the wrist camera stop dropping frames', hoursAgo(20)),
      said('reduced the exposure', hoursAgo(19)),
      said('the hub is the cause, not the exposure', minutesAgo(1)),
    ])
    sessions.syncSessions(AGENT, 'default', envWith())

    const after = one(db.api.listRecords({ workspaceId: 'default', kind: 'session' }), 'session record')
    expect(after.data['doing']).toBe('the hub is the cause, not the exposure')
  })

  it('keeps links across a sweep', () => {
    discovered()
    const env = envWith()
    sessions.syncSessions(AGENT, 'default', env)
    const record = one(db.api.listRecords({ workspaceId: 'default', kind: 'session' }), 'session record')
    const module = db.api.createRecord({ workspaceId: 'default',
      kind: 'module',
      title: 'Close-up camera',
      actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id },
    })
    db.api.createLink({ fromId: record.id, toId: module.id, type: 'relates_to', actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id } })

    sessions.syncSessions(AGENT, 'default', envWith({ processes: [liveProcess(5, id)] }))

    // The link written here, and the one the office wrote from the run's flow run (wave 13p round 25). Both stay.
    expect(db.api.resolveLinks(record.id).map((link) => link.other.kind).sort()).toEqual(['flow_run', 'module'])
  })

  it('clears a stale `running` when the session is no longer there', () => {
    discovered(minutesAgo(1))
    sessions.syncSessions(AGENT, 'default', envWith({ processes: [liveProcess(5, id)] }))
    expect(one(db.api.listRecords({ workspaceId: 'default', kind: 'session' }), 'record').data['state']).toBe('running')

    // A day later, with no process. A stored `running` here is a page showing green for a session
    // that stopped, which is exactly the silence this module exists to remove.
    sessions.syncSessions(AGENT, 'default', envWith({ now: new Date(NOW.getTime() + 24 * 60 * 60 * 1000) }))

    const after = one(db.api.listRecords({ workspaceId: 'default', kind: 'session' }), 'record')
    expect(after.data['state']).toBe('orphaned')
    expect(sessions.stampOf(after)?.observedState).toBe('orphaned')
  })

  it('keeps a record whose log has been deleted, and calls it orphaned', () => {
    discovered()
    const env = envWith()
    sessions.syncSessions(AGENT, 'default', env)
    rmSync(join(home, '.claude', 'projects', PROJECT_SLUG, `${id}.jsonl`))

    // Building the list only from what is on disk would make this row silently stop appearing.
    const view = onlySession(envWith())
    expect(view.state).toBe('orphaned')
    expect(view.stateReason).toContain('no longer on disk')
    expect(view.recordId).not.toBeNull()
  })

  it('reports a hand-written session as its writer\'s word, not as an observation', () => {
    db.api.createRecord({ workspaceId: 'default',
      kind: 'session',
      title: 'typed in by hand',
      data: { state: 'crashed', runtime: 'claude-code', detail: 'exit 137' },
      actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id },
    })

    const view = onlySession(envWith())
    expect(view.state).toBe('crashed')
    expect(view.stateReason).toContain("the writer's word, not an observation")
    expect(view.discovered).toBe(false)

    // Discovery has nothing to say about it, so it says nothing.
    const report = sessions.syncSessions(AGENT, 'default', envWith())
    expect(report.discovered).toBe(0)
  })
})

// ================================================================================== over HTTP

describe('the HTTP surface', () => {
  aFreshDatabaseForThisCase()

  let app: FastifyInstance

  async function serve(opts: { processes?: ProcessInfo[]; scanFails?: string; now?: Date } = {}) {
    const { sessionRoutes } = await import('../src/server/api/sessions.ts')
    const { recordRoutes } = await import('../src/server/api/records.ts')
    const { installErrorHandling } = await import('../src/server/lib/http.ts')
    app = Fastify()
    installErrorHandling(app)
    await app.register(recordRoutes, { prefix: '/api' })
    await app.register(sessionRoutes, { prefix: '/api', env: () => envWith(opts) })
    await app.ready()
    return app
  }

  afterEach(async () => {
    if (app) await app.close()
  })

  const body = (res: { body: string }) => JSON.parse(res.body) as Record<string, any>

  it('lists sessions with a per-state count and where it looked', async () => {
    writeLog('99999999-0000-0000-0000-000000000001', [prompt('a', minutesAgo(1)), said('b', minutesAgo(1))])
    writeLog('99999999-0000-0000-0000-000000000002', [prompt('c', hoursAgo(40)), said('d', hoursAgo(40))])
    const server = await serve({ processes: [liveProcess(3, '99999999-0000-0000-0000-000000000001')] })

    const res = await server.inject({ method: 'GET', url: '/api/sessions' })
    expect(res.statusCode).toBe(200)
    const out = body(res)

    expect(out['sessions']).toHaveLength(2)
    expect(out['counts']['running']).toBe(1)
    expect(out['counts']['orphaned']).toBe(1)
    expect(out['counts']['finished']).toBe(0)
    expect(out['searched'][0]['tool']).toBe('claude-code')
    // Served rather than assumed: a caller wondering why nothing is ever finished gets the answer.
    expect(out['searched'][0]['reportsCleanExit']).toBe(false)
    expect(out['warning']).toBeUndefined()
  })

  it('warns, once and at the top, when the machine itself could not be inspected', async () => {
    writeLog('99999999-0000-0000-0000-000000000003', [prompt('a', hoursAgo(40)), said('b', hoursAgo(40))])
    const server = await serve({ scanFails: '/proc is not there' })

    const out = body(await server.inject({ method: 'GET', url: '/api/sessions' }))
    expect(out['warning']).toContain('could not be listed')
    expect(out['sessions'][0]['state']).toBe('unknown')
  })

  it('answers one session with the tail of its own log', async () => {
    const id = '99999999-0000-0000-0000-000000000004'
    writeLog(id, [prompt('go', hoursAgo(3)), said('first', hoursAgo(2)), said('second', hoursAgo(1))])
    const server = await serve()

    const out = body(await server.inject({ method: 'GET', url: `/api/sessions/claude-code:${id}?lines=1` }))
    expect(out['session']['externalId']).toBe(id)
    expect(out['tail']['lines']).toHaveLength(1)
    expect(out['tail']['lines'][0]['text']).toBe('second')
    // The transcript is read from the tool's file, never copied into Mole Office.
    expect(out['tail']['path']).toContain(`${id}.jsonl`)
  })

  it('refuses an unusable line count with a sentence saying why', async () => {
    const server = await serve()
    const res = await server.inject({ method: 'GET', url: '/api/sessions/x?lines=99999' })
    expect(res.statusCode).toBe(400)
    expect(body(res)['error']).toContain('at most 500')
  })

  it('404s an unknown session, and says where the real ids are', async () => {
    const server = await serve()
    const res = await server.inject({ method: 'GET', url: '/api/sessions/claude-code:nope' })
    expect(res.statusCode).toBe(404)
    expect(body(res)['error']).toContain('GET /api/sessions')
  })

  it('files a session on demand when linking one that was never recorded', async () => {
    const id = '99999999-0000-0000-0000-000000000005'
    writeLog(id, [prompt('break the gripper', hoursAgo(9)), said('broke it', hoursAgo(9))])
    const server = await serve()

    const created = await server.inject({
      method: 'POST',
      url: '/api/records',
      payload: { kind: 'problem', title: 'gripper drops the cube' },
    })
    const problemId = body(created)['record']['id'] as string

    const res = await server.inject({
      method: 'POST',
      url: `/api/sessions/claude-code:${id}/link`,
      payload: { toId: problemId, type: 'relates_to' },
    })

    expect(res.statusCode).toBe(201)
    const out = body(res)
    // Refusing would hand back an id GET /api/sessions had just given the caller. Filing it is
    // right, and saying so is what stops a record appearing behind anybody's back.
    expect(out['createdSessionRecord']).toBe(true)
    expect(out['note']).toContain('had not been filed')
    expect(out['toId']).toBe(problemId)

    // The link is a normal link, so the problem's page shows it as a backlink like anything else.
    const problem = body(await server.inject({ method: 'GET', url: `/api/records/${problemId}` }))
    expect(problem['links']).toHaveLength(1)
    expect(problem['links'][0]['isBacklink']).toBe(true)
  })

  it('links by title, and does not file a session twice', async () => {
    const id = '99999999-0000-0000-0000-000000000006'
    writeLog(id, [prompt('touch the module', hoursAgo(9)), said('touched', hoursAgo(9))])
    const server = await serve()

    await server.inject({ method: 'POST', url: '/api/records', payload: { kind: 'module', title: 'Close-up camera' } })

    const first = body(
      await server.inject({
        method: 'POST',
        url: `/api/sessions/claude-code:${id}/link`,
        payload: { toTitle: 'Close-up camera', type: 'relates_to' },
      }),
    )
    expect(first['createdSessionRecord']).toBe(true)

    const second = body(
      await server.inject({
        method: 'POST',
        url: `/api/sessions/claude-code:${id}/link`,
        payload: { toTitle: 'Close-up camera', type: 'discusses' },
      }),
    )
    expect(second['createdSessionRecord']).toBe(false)
    expect(second['sessionRecordId']).toBe(first['sessionRecordId'])
  })

  it('refuses a link that names both ends, in the same words api/links.ts uses', async () => {
    const id = '99999999-0000-0000-0000-000000000007'
    writeLog(id, [prompt('x', hoursAgo(9))])
    const server = await serve()

    const res = await server.inject({
      method: 'POST',
      url: `/api/sessions/claude-code:${id}/link`,
      payload: { toId: 'a', toTitle: 'b' },
    })
    expect(res.statusCode).toBe(400)
    expect(body(res)['error']).toContain('exactly one of toId or toTitle')
  })

  it('discovers idempotently over HTTP', async () => {
    writeLog('99999999-0000-0000-0000-000000000008', [prompt('a', hoursAgo(9)), said('b', hoursAgo(9))])
    const server = await serve()

    const first = body(await server.inject({ method: 'POST', url: '/api/sessions/discover' }))
    expect(first['report']['created']).toBe(1)

    const second = body(await server.inject({ method: 'POST', url: '/api/sessions/discover' }))
    expect(second['report']['created']).toBe(0)
    expect(second['report']['unchanged']).toBe(1)
    // The sentence has to explain the empty `state`, or it reads as a bug rather than a decision.
    expect(second['note']).not.toContain('could not have a state stored')
  })

  it('does not write to the database on a read', async () => {
    writeLog('99999999-0000-0000-0000-000000000009', [prompt('a', hoursAgo(9)), said('b', hoursAgo(9))])
    const server = await serve()

    await server.inject({ method: 'GET', url: '/api/sessions' })
    await server.inject({ method: 'GET', url: '/api/sessions/claude-code:99999999-0000-0000-0000-000000000009' })

    // A GET that filed records would mean a browser prefetch silently creating them.
    expect(db.api.listRecords({ workspaceId: 'default', kind: 'session' })).toEqual([])
  })
})

// ================================================================================ the contract

describe('the adapter contract', () => {
  aFreshDatabaseForThisCase()

  it('can store every state it can observe, so nothing is seen and then dropped', async () => {
    // This used to assert the opposite: six observable states, four storable, with `orphaned`
    // and `unknown` having nowhere to go. That gap meant an abandoned session was stored with
    // no state at all and read as merely incomplete -- hiding the one case the resource ledger
    // exists to surface. Both are now storable, so the two lists must match exactly.
    const { SESSION_STATES } = await import('../src/shared/types.ts')
    expect([...OBSERVED_SESSION_STATES].sort()).toEqual([...SESSION_STATES].sort())
  })

  it('answers the same thing about one session as the list does', () => {
    // A detail page saying `running` beside a list saying `orphaned` is the sort of contradiction
    // that makes somebody stop believing both, so the two share one sweep.
    const id = '77777777-0000-0000-0000-000000000001'
    writeLog(id, [prompt('go', hoursAgo(9)), said('stopped', hoursAgo(9))])
    const env = envWith()

    const fromList = one(sessions.listSessions('default', env), 'session')
    const bySessionId = sessions.getSession(fromList.id, 'default', env)
    expect(bySessionId).toEqual(fromList)

    // ...and the record id is the other id a caller legitimately holds, once it is filed.
    sessions.syncSessions({ type: 'agent', id: 'test' }, 'default', env)
    const recordId = one(db.api.listRecords({ workspaceId: 'default', kind: 'session' }), 'record').id
    expect(sessions.getSession(recordId, 'default', env)?.id).toBe(fromList.id)
  })

  it('says where it looked, so "no sessions" is an answer rather than a shrug', async () => {
    const { claudeCodeAdapter } = await import('../src/server/lib/adapters/claude-code.ts')
    expect(claudeCodeAdapter.looksIn(envWith())).toBe(`${home}/.claude/projects/<project>/<session-id>.jsonl`)
    // A machine where Claude Code has never run is empty, not an error.
    expect(sessions.listSessions('default', envWith())).toEqual([])
  })
})

// ================================================================== the operating-system seam

/**
 * THE ONE SEAM, PROVED RATHER THAN ASSERTED.
 *
 * Every test above hands `listSessions` an AdapterEnv it wrote by hand, including the process
 * table. That proves the state ladder is right and proves nothing at all about the wiring: for
 * two months `defaultEnv` -- the env the real `GET /api/sessions` uses -- read /proc through a
 * function of its own, outside `OsProbe`, so the sessions the product actually shows came from
 * whatever happened to be running on the machine and could not be described by a test.
 *
 * These tests use `defaultEnv` and override only the home directory and the clock. The process
 * table is left alone deliberately, so the only way a fake process can reach the answer is
 * through the probe. Delete the `currentProcessTable` call in adapters/index.ts and the first
 * test below fails: pid 424242 does not exist on this machine and no real process on it names a
 * session id that was invented three lines earlier.
 */
describe('session discovery reads the process table through the installed probe', () => {
  oneDatabaseForThisGroup()

  type ResourcesLib = typeof import('../src/server/lib/resources.ts')
  type AdaptersLib = typeof import('../src/server/lib/adapters/index.ts')
  type Probe = Parameters<ResourcesLib['useOsProbe']>[0]

  let res: ResourcesLib
  let adapters: AdaptersLib

  beforeEach(async () => {
    // The same module registry the outer beforeEach loaded `sessions` from, so the probe
    // installed here is the probe the sweep reads.
    res = await import('../src/server/lib/resources.ts')
    adapters = await import('../src/server/lib/adapters/index.ts')
  })

  afterEach(() => {
    // Put the real machine back. The probe is module-level state and a fake left installed would
    // be inherited by anything that ran afterwards.
    res.useOsProbe(res.LINUX_PROBE)
  })

  /**
   * A machine that does not exist. Everything but the process table refuses to answer, because
   * nothing in this file asks it anything else and a fake that pretended to would be describing
   * a machine nobody checked.
   */
  function fakeMachine(table: ProcessScan): Probe {
    return {
      platform: 'fake',
      processTable: () => table,
      processById: () => null,
      processesInGroup: () => [],
      listeningPorts: () => [],
      gpu: () => ({ available: false, reason: 'this fake machine has no GPU to report on' }),
      containers: () => ({ available: false, reason: 'this fake machine runs no containers' }),
      locks: () => ({ files: [], unreadable: [] }),
      ownProcessGroup: () => 999_999,
      killProcessGroup: () => {
        throw new Error('this file never kills anything')
      },
      stopContainer: () => {
        throw new Error('this file never stops anything')
      },
    }
  }

  /** The env the product itself builds, with only the home directory and the clock described. */
  const realEnv = () => adapters.defaultEnv({ homeDir: home, now: NOW })

  it('reports the fake machine’s process, which cannot exist on this one', () => {
    const id = 'ffffffff-0000-0000-0000-000000000001'
    // The transcript names no working directory, so the only one available is the process's. A
    // transcript that named one would win, which is right — it is first-hand — and would hide
    // whether the probe's answer had travelled.
    writeLog(id, [prompt('measure the gripper', minutesAgo(40), null)])

    res.useOsProbe(
      fakeMachine({
        ok: true,
        processes: [
          {
            pid: 424_242,
            command: `${THE_TEST_FIXTURE_ROOT}/.local/share/claude/versions/2.1.223 --session-id ${id}`,
            cwd: '/machines/that/do/not/exist',
          },
        ],
      }),
    )

    const view = one(sessions.listSessions('default', realEnv()), 'session')

    // `idle` is only reachable when a live process claims the session, so this word cannot be
    // produced by a sweep that read the real /proc: nothing there names this id.
    expect(view.state).toBe('idle')
    expect(view.pid).toBe(424_242)
    expect(view.cwd).toBe('/machines/that/do/not/exist')
    expect(view.stateReason).toContain('424242')
  })

  it('reports the same session as orphaned when the fake machine is empty', () => {
    const id = 'ffffffff-0000-0000-0000-000000000002'
    writeLog(id, [prompt('measure the gripper', hoursAgo(6)), said('done for now', hoursAgo(3))])

    res.useOsProbe(fakeMachine({ ok: true, processes: [] }))

    const view = one(sessions.listSessions('default', realEnv()), 'session')
    expect(view.state).toBe('orphaned')
    expect(view.pid).toBeNull()
  })

  it('carries the probe’s own words when the probe could not look', () => {
    const id = 'ffffffff-0000-0000-0000-000000000003'
    writeLog(id, [prompt('measure the gripper', hoursAgo(6)), said('done for now', hoursAgo(3))])

    res.useOsProbe(fakeMachine({ ok: false, reason: 'this fake machine declined to list its processes' }))

    const view = one(sessions.listSessions('default', realEnv()), 'session')
    // "I could not look" is never "it is dead": six hours of silence would otherwise be orphaned.
    expect(view.state).toBe('unknown')
    expect(view.stateReason).toContain('this fake machine declined to list its processes')
  })

  it('hands the sweep exactly what the probe returned, and nothing from /proc', () => {
    const table: ProcessScan = {
      ok: true,
      processes: [{ pid: 11, command: 'a machine with one process on it', cwd: null }],
    }
    res.useOsProbe(fakeMachine(table))

    // The whole table, compared whole. A real /proc read returns several hundred rows here.
    expect(adapters.defaultEnv().scanProcesses()).toEqual(table)
  })

  it('reads the process table once per env, however many sessions ask', () => {
    let reads = 0
    const probe = fakeMachine({ ok: true, processes: [] })
    probe.processTable = () => {
      reads += 1
      return { ok: true, processes: [] }
    }
    res.useOsProbe(probe)

    for (const n of [1, 2, 3]) {
      writeLog(`ffffffff-0000-0000-0000-00000000001${n}`, [prompt('go', hoursAgo(6)), said('stopped', hoursAgo(3))])
    }

    const env = realEnv()
    expect(sessions.listSessions('default', env)).toHaveLength(3)
    // One sweep, one moment. Re-reading between two sessions would let the same list say one
    // process is alive on one row and gone on the next.
    expect(reads).toBe(1)
  })

  it('does not round a probe with no process table up to the real machine', () => {
    const id = 'ffffffff-0000-0000-0000-000000000004'
    writeLog(id, [prompt('measure the gripper', hoursAgo(6)), said('done for now', hoursAgo(3))])

    // `processTable` is the one optional method on OsProbe, because three test files owned
    // elsewhere build a probe of ports and locks with no process table. Omitting it must mean
    // "this probe cannot say", never "go and read /proc instead" -- a silent fallback there would
    // put the real machine back on the page of every test that thought it had described one.
    const half = fakeMachine({ ok: true, processes: [] })
    delete half.processTable
    res.useOsProbe(half)

    const scan = adapters.defaultEnv().scanProcesses()
    expect(scan.ok).toBe(false)
    if (scan.ok) throw new Error('a probe with no process table answered as though it had one')
    expect(scan.reason).toContain('processTable()')
    expect(scan.reason).toContain('fake')

    expect(one(sessions.listSessions('default', realEnv()), 'session').state).toBe('unknown')
  })

  it('reads this machine when nothing has been installed, which is the production path', () => {
    // The counterpart to every test above: the default really is the real Linux walk, so the
    // seam did not quietly disconnect the product from the machine it runs on.
    const scan = adapters.defaultEnv().scanProcesses()
    if (!scan.ok) throw new Error(`/proc could not be read on this machine: ${scan.reason}`)
    expect(scan.processes.some((p) => p.pid === process.pid)).toBe(true)
    // And it is the same answer the probe gives, because it is the same function.
    const throughProbe = res.LINUX_PROBE.processTable?.()
    expect(throughProbe?.ok).toBe(true)
  })
})

// ============================================================ the seam, over the real route

/**
 * THE SAME PROOF, WITH NOTHING INJECTED, THROUGH THE ENDPOINT THE PRODUCT SERVES.
 *
 * Every other HTTP test in this file registers `sessionRoutes` with `env: () => envWith(...)`, so
 * what they exercise is the route's ability to use an environment somebody handed it. That is a
 * real property and it is not this one. The route's DEFAULT is `() => defaultEnv()`, and until now
 * no test took that path: the wiring from the installed probe, through `defaultEnv`, through
 * `sweepSessions`, into the JSON a browser reads was covered by nothing at all.
 *
 * These two tests inject no environment. The route builds its own, exactly as it does in
 * production. Only two things about the world are changed, and both from outside the code:
 *
 *   - `HOME`, so `homedir()` finds the fixture transcripts. On POSIX Node reads `$HOME` first, so
 *     this is the real `homedir()` answering, not a stub of it.
 *   - the installed `OsProbe`, through the one public seam, `useOsProbe`.
 *
 * So the pid, the working directory and the warning below can have come from nowhere else. Pid
 * 424242 is not running on this machine, the test folder is held by the default project, and the
 * session id was invented three lines above the assertion. If the seam were removed and
 * `defaultEnv` went back to reading /proc itself, these are the tests that go red.
 */
describe('GET /api/sessions reports the machine the probe describes, not this one', () => {
  oneDatabaseForThisGroup()

  type ResourcesLib = typeof import('../src/server/lib/resources.ts')
  type AdaptersLib = typeof import('../src/server/lib/adapters/index.ts')
  type Probe = Parameters<ResourcesLib['useOsProbe']>[0]

  let res: ResourcesLib
  let adapters: AdaptersLib
  let app: FastifyInstance
  let realHome: string | undefined

  beforeEach(async () => {
    res = await import('../src/server/lib/resources.ts')
    adapters = await import('../src/server/lib/adapters/index.ts')
    realHome = process.env['HOME']
  })

  afterEach(async () => {
    // Order matters. The real machine goes back first, because a fake probe left installed would be
    // inherited by whatever ran next, and the real HOME goes back whatever else failed.
    res.useOsProbe(res.LINUX_PROBE)
    if (realHome === undefined) delete process.env['HOME']
    else process.env['HOME'] = realHome
    if (app) await app.close()
  })

  /** A machine that does not exist. Only the process table answers; everything else refuses. */
  function fakeMachine(table: ProcessScan): Probe {
    return {
      platform: 'fake',
      processTable: () => table,
      processById: () => null,
      processesInGroup: () => [],
      listeningPorts: () => [],
      gpu: () => ({ available: false, reason: 'this fake machine has no GPU to report on' }),
      containers: () => ({ available: false, reason: 'this fake machine runs no containers' }),
      locks: () => ({ files: [], unreadable: [] }),
      ownProcessGroup: () => 999_999,
      killProcessGroup: () => {
        throw new Error('this file never kills anything')
      },
      stopContainer: () => {
        throw new Error('this file never stops anything')
      },
    }
  }

  /** The routes as src/server/index.ts registers them: no `env`, so the route builds its own. */
  async function serveWithNothingInjected(): Promise<FastifyInstance> {
    // Set before the server exists, so nothing can read the real home directory even once.
    process.env['HOME'] = home
    const { sessionRoutes } = await import('../src/server/api/sessions.ts')
    const { installErrorHandling } = await import('../src/server/lib/http.ts')
    app = Fastify()
    installErrorHandling(app)
    await app.register(sessionRoutes, { prefix: '/api' })
    await app.ready()
    return app
  }

  /**
   * A transcript that went quiet long enough to be past `idle` and nowhere near `orphaned`.
   *
   * The two thresholds are read from the module rather than assumed to be 5m and 2h, because they
   * are configuration and a machine that set them differently would otherwise fail this test with a
   * message about session states, which is not what would have gone wrong.
   */
  function quietTranscript(id: string, cwd: string | null = null): void {
    const gap = adapters.IDLE_AFTER_SECONDS + 60
    if (gap >= adapters.ORPHAN_AFTER_SECONDS) {
      throw new Error(
        `This test needs a gap between the idle threshold (${adapters.IDLE_AFTER_SECONDS}s) and the orphan ` +
          `threshold (${adapters.ORPHAN_AFTER_SECONDS}s) wide enough to sit in. Set MOLE_OFFICE_ORPHAN_AFTER higher.`,
      )
    }
    // Real clock, not this file's frozen NOW: the route stamps its own env with `new Date()`.
    const at = new Date(Date.now() - gap * 1000).toISOString()
    writeLog(id, [prompt('measure the gripper', at, cwd)])
  }

  const body = (r: { body: string }) => JSON.parse(r.body) as Record<string, any>

  it('shows a process that exists only on the fake machine', async () => {
    const id = 'eeeeeeee-0000-0000-0000-000000000001'
    quietTranscript(id)

    res.useOsProbe(
      fakeMachine({
        ok: true,
        processes: [
          {
            pid: 424_242,
            command: `${THE_TEST_FIXTURE_ROOT}/.local/share/claude/versions/2.1.223 --session-id ${id}`,
            cwd: REAL_CWD,
          },
        ],
      }),
    )

    const server = await serveWithNothingInjected()
    const out = body(await server.inject({ method: 'GET', url: '/api/sessions' }))

    expect(out['sessions']).toHaveLength(1)
    const session = out['sessions'][0]
    // `idle` is only reachable when a live process claims the session, so this word cannot be
    // produced by a sweep of the real /proc: nothing there names an id invented in this test.
    expect(session['state']).toBe('idle')
    expect(session['pid']).toBe(424_242)
    // The transcript names no working directory, so the process is the only source of this path.
    expect(session['cwd']).toBe(REAL_CWD)
    expect(session['stateReason']).toContain('424242')
    expect(out['counts']['idle']).toBe(1)
    expect(out['warning']).toBeUndefined()
  })

  it('carries the probe’s own refusal into the warning at the top of the reply', async () => {
    const id = 'eeeeeeee-0000-0000-0000-000000000002'
    quietTranscript(id, REAL_CWD)

    res.useOsProbe(
      fakeMachine({ ok: false, reason: 'this fake machine declined to list its processes' }),
    )

    const server = await serveWithNothingInjected()
    const out = body(await server.inject({ method: 'GET', url: '/api/sessions' }))

    // /proc reads perfectly well on the machine running this suite, so a reply that says it could
    // not be listed — in the fake's own words — can only have come through the probe.
    expect(out['warning']).toContain('this fake machine declined to list its processes')
    expect(out['sessions'][0]['state']).toBe('unknown')
    expect(out['sessions'][0]['pid']).toBeNull()
  })
})

// ================================================================ where a run is filed, and why

/**
 * THE RULE THAT SAYS WHICH PIPELINE OR MODULE A RUN BELONGS TO, TESTED WHERE IT NOW LIVES.
 *
 * It used to live in `placeSessions` in src/web/components/SessionPanel.tsx and was tested in
 * tests/sessions-ui.test.ts. Seven agents recording their own work through the API needed to know
 * which project their run would be filed under; six read that React component to find out and the
 * seventh, which read only the API, has its session filed under a module it never worked on. A rule
 * that decides what a page shows and that no endpoint serves is a rule an author cannot write
 * against, so it moved here — and these are the tests that came with it, plus one for each of the
 * defects the move exposed.
 *
 * Everything below builds records in a throwaway database and reads the answer back the way the
 * product does. No title is ever evidence: that is the property the whole rule rests on.
 */
describe('a run is filed by what was recorded, and never by what its title says', () => {
  aFreshDatabaseForThisCase()

  const AGENT_ACTOR = (sessionId: string) => ({ type: 'agent', id: 'claude-code', sessionId }) as const
  const HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const

  /** A session record, filed by hand exactly as an agent writing through the API files one. */
  function session(title: string, data: Record<string, unknown> = { state: 'running' }) {
    return db.api.createRecord({ workspaceId: 'default', kind: 'session', title, data, actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id } })
  }

  const module_ = (title: string) =>
    db.api.createRecord({ workspaceId: 'default', kind: 'module', title, actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id } })
  const pipeline = (title: string) =>
    db.api.createRecord({ workspaceId: 'default', kind: 'pipeline', title, actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id } })

  /** The placement of one session record, read fresh, the way the link route reads it. */
  const placementOf = (record: { id: string }) => sessions.sessionPlacement(record.id, record.id, 'default')

  it('files a run under the module a link from its record names, in the link’s own words', () => {
    const gripper = module_('Tray clamp')
    const run = session('calib · setting 13 force capture')
    db.api.createLink({ fromId: run.id, toId: gripper.id, type: 'part_of', actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id } })

    const placement = placementOf(run)
    expect(placement.kind).toBe('in')
    if (placement.kind !== 'in') return
    expect(placement.primary.project.title).toBe('Tray clamp')
    expect(placement.primary.evidence.how).toBe('link')
    expect(placement.primary.sentence).toBe(
      'A link joins this run and the module “Tray clamp” — from this run’s end it reads “part of”. That word is ' +
        'this run’s own statement that it belongs there, so it is taken ahead of any other link word and ahead ' +
        'of how many records point elsewhere.',
    )
  })

  /**
   * THE DEFECT THREE AGENTS HIT, AND THE ONE THAT MISFILED A SESSION. A block is a record so that
   * work can attach to it, and linking a run to the block it is working on is the most specific
   * statement an author can make. It used to place the run nowhere at all, because the rule looked
   * only for a pipeline or a module at the end of the link and a block is neither — and a pipeline
   * does not link to its blocks, it lists them.
   */
  it('files a run linked to a block under the pipeline that holds that block', () => {
    const pipe = pipeline('Mole Office overnight development pass')
    const { block } = db.blocks.addBlock(
      pipe.id,
      { name: 'Make a pipeline block a record', state: 'doing' },
      { type: 'human', id: THE_TEST_OFFICES_OWNER.id },
    )
    const run = session('blocks-migration-dogfood')
    db.api.createLink({ fromId: run.id, toId: block.id, type: 'part_of', actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id } })

    const placement = placementOf(run)
    expect(placement.kind).toBe('in')
    if (placement.kind !== 'in') return
    expect(placement.primary.project.title).toBe('Mole Office overnight development pass')
    expect(placement.primary.evidence.how).toBe('block-link')
    // The block is named, because "filed under this pipeline" and "filed under this pipeline
    // because you named one step of it" are different statements.
    expect(placement.primary.sentence).toContain(block.title)
    expect(placement.primary.sentence).toContain('holds that block')
  })

  it('files a run under what the change log says it wrote to, and one hop past that', () => {
    const gripper = module_('Tray clamp')
    const run = session('a run that wrote things')
    const task = db.api.createRecord({ workspaceId: 'default',
      kind: 'task',
      title: 'Reprint the v3 fingers',
      actor: AGENT_ACTOR(run.id),
    })
    db.api.createLink({ fromId: task.id, toId: gripper.id, type: 'part_of', actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id } })

    const placement = placementOf(run)
    expect(placement.kind === 'in' && placement.primary.evidence.how).toBe('through')
    // The middle record is named every time, so the chain can be argued with rather than trusted.
    expect(placement.kind === 'in' && placement.primary.sentence).toContain('Reprint the v3 fingers')

    // And a write to the module itself is stronger than a chain through a record.
    db.api.patchRecord(gripper.id, { summary: 'touched by the run' }, AGENT_ACTOR(run.id))
    expect(placementOf(run).kind === 'in' && (placementOf(run) as { primary: { evidence: { how: string } } }).primary.evidence.how).toBe('changed')
  })

  /**
   * THE BRANCH THAT COULD NOT BE REACHED. `wrote-nothing` and `reaches-nothing` used to be chosen
   * by `touched === 0 && linked === 0`, where `linked` counted only links to a PIPELINE OR MODULE —
   * and any such link would have placed the run, so that branch was reached only with `linked` at
   * zero and the count said nothing. A run that linked itself to a problem and to nothing else was
   * therefore told nothing was linked to it, which is the opposite of what it had just done.
   */
  it('tells a run that linked itself to something that reaches no project exactly that', () => {
    module_('Tray clamp')
    const run = session('a run that linked itself to a problem')
    const problem = db.api.createRecord({ workspaceId: 'default',
      kind: 'problem',
      title: 'The migration branch has never run on real data',
      actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id },
    })
    db.api.createLink({ fromId: run.id, toId: problem.id, type: 'discusses', actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id } })

    const placement = placementOf(run)
    expect(placement.kind).toBe('unassigned')
    if (placement.kind !== 'unassigned') return
    expect(placement.reason).toEqual({ why: 'reaches-nothing', touched: 0, linked: 1 })
    expect(placement.sentence).toContain('It has 1 link and touched 0 records')
    // And the answer carries the request that would file it, naming a block as one of the things
    // that can be named — which is what the agent that linked to a block had no way to find out.
    expect(placement.howToPlace).toContain('POST /api/sessions/')
    expect(placement.howToPlace).toContain('block')
  })

  it('says nothing was filed rather than nothing was found, and tells them apart', () => {
    module_('Tray clamp')
    const quiet = session('a run that did nothing at all')
    expect(placementOf(quiet)).toMatchObject({ kind: 'unassigned', reason: { why: 'wrote-nothing' } })
    // No record at all is a different answer: there is nothing that could carry a link or a row.
    expect(sessions.sessionPlacement('claude-code:never-filed', null, 'default')).toMatchObject({
      kind: 'unassigned',
      reason: { why: 'not-filed' },
    })
  })

  /**
   * ------------------------------------------------------------------------------------------
   * WHAT A RUN SAYS ABOUT WHERE IT BELONGS, AGAINST WHAT IT HAPPENED TO TOUCH
   * ------------------------------------------------------------------------------------------
   *
   * MEASURED ON THIS WORKSPACE'S OWN RECORD, and the case the first test rebuilds line for line. One
   * run linked itself `part_of` the pipeline it was working in and `relates_to` the sessions module,
   * then wrote two records that reach that module. Both links are statements, so the tie fell to
   * support — three claims against one — and the run was grouped under a module it had never said it
   * belonged to.
   *
   * `part_of` is the only word in the vocabulary whose whole meaning is containment, and containment
   * is exactly what the grouping asks, so it is taken first. The tests below pin BOTH halves of that,
   * because half of it is a rule nobody agreed to: `part of` wins, and no other word is ranked at
   * all. The last one pins the word to the vocabulary, so a thirteenth link type that happened to
   * read "part of" could not silently start winning too.
   */
  describe('a run’s own “part of” outranks what its writing happened to reach', () => {
    /** The two records the live run wrote that reached the module, and the link that carried them. */
    function wroteTowards(run: { id: string }, project: { id: string }, titles: readonly string[]) {
      for (const title of titles) {
        const found = db.api.createRecord({ workspaceId: 'default', kind: 'problem', title, actor: AGENT_ACTOR(run.id) })
        db.api.createLink({ fromId: found.id, toId: project.id, type: 'about', actor: HUMAN })
      }
    }

    it('files the run where it said it belongs, not where three other claims point', () => {
      const pipe = pipeline('Mole Office overnight development pass — 2026-08-10')
      const mod = module_('Mole Office — sessions and the tool adapters')
      const run = session('dogfood · synthesis — turn six')

      db.api.createLink({ fromId: run.id, toId: pipe.id, type: 'part_of', actor: HUMAN })
      db.api.createLink({ fromId: run.id, toId: mod.id, type: 'relates_to', actor: HUMAN })
      wroteTowards(run, mod, [
        'A session’s workspace is accepted and read by nothing',
        'The placement rule runs only in the browser',
      ])

      const placement = placementOf(run)
      expect(placement.kind).toBe('in')
      if (placement.kind !== 'in') return
      expect(placement.primary.project.title).toBe('Mole Office overnight development pass — 2026-08-10')
      // It wins on the word alone. The module reached this run three times over and the pipeline once,
      // which is the count that used to decide it — so the numbers still say what they said.
      expect(placement.primary.support).toBe(1)

      // AND THE OTHER SIDE IS STILL ON THE ANSWER, with its own evidence, its own count and its own
      // sentence. A reader who thinks the module is the better home can see everything that pointed
      // there; nothing is hidden by the run having won its own argument.
      const also = placement.also.find((claim) => claim.project.id === mod.id)
      expect(also).toBeDefined()
      expect(also?.support).toBe(3)
      expect(also?.sentence).toContain('“relates to”')
      // The sentence says WHY the primary won, where the answer is read, rather than only in a rule
      // somebody has to go and find.
      expect(placement.primary.sentence).toContain('own statement that it belongs there')
    })

    it('reads the same word the same way when the run named one step of the work', () => {
      const mine = pipeline('The pipeline this run said it was working in')
      const { block: step } = db.blocks.addBlock(mine.id, { name: 'Rank the link words', state: 'doing' }, HUMAN)
      const other = pipeline('A pipeline this run kept bumping into')
      const { block: theirs } = db.blocks.addBlock(other.id, { name: 'Export the archive', state: 'doing' }, HUMAN)
      const run = session('a run that named the step it was on')

      db.api.createLink({ fromId: run.id, toId: step.id, type: 'part_of', actor: HUMAN })
      db.api.createLink({ fromId: run.id, toId: theirs.id, type: 'relates_to', actor: HUMAN })
      // And a record it wrote that reaches the other pipeline as well, so that one has more behind it.
      wroteTowards(run, other, ['The export drops the machine facts'])

      const placement = placementOf(run)
      expect(placement.kind === 'in' && placement.primary.project.title).toBe(
        'The pipeline this run said it was working in',
      )
      expect(placement.kind === 'in' && placement.primary.evidence.how).toBe('block-link')
      // The loser is named with the block it was named through, so both statements stay readable.
      expect(placement.kind === 'in' && placement.also[0]?.project.title).toBe(
        'A pipeline this run kept bumping into',
      )
    })

    /**
     * THE HALF THAT IS A RULE NOBODY AGREED TO. `implements` is arguable both ways as a statement of
     * belonging, `derived_from` is arguable both ways, and `discusses` is plainly not one. None of
     * them is ranked, so a run that says `implements` is still placed by weight of evidence exactly as
     * it was before — and this test goes red the day somebody invents the other eleven rungs.
     */
    it('ranks no word but “part of”: `implements` does not beat `relates to`', () => {
      const pipe = pipeline('The pipeline this run implements a step of')
      const mod = module_('The module this run kept writing about')
      const run = session('a run that implements one thing and relates to another')

      // STORED PAST THE DOOR, as a row written before wave 13s is: the door now refuses `implements`
      // from anything but a module to a block (problem kKY18MXI98F_), and runs holding such a link
      // are still in the corpus. The ranking reads what is stored.
      db.client.sqlite
        .prepare(
          'insert into links (id, workspace_id, owner_id, created_at, updated_at, from_id, to_id, type, inferred, created_by) ' +
            `values ('old-run-implements', 'default', '${THE_TEST_OFFICES_OWNER.id}', '2026-09-26 10:00:00', '2026-09-26 10:00:00', ?, ?, 'implements', 0, '${THE_TEST_OFFICES_OWNER.id}')`,
        )
        .run(run.id, pipe.id)
      db.api.createLink({ fromId: run.id, toId: mod.id, type: 'relates_to', actor: HUMAN })
      wroteTowards(run, mod, ['Something the run found while writing about the module'])

      const placement = placementOf(run)
      // Two equal statements, so the count decides — which is the rule that was there all along.
      expect(placement.kind === 'in' && placement.primary.project.title).toBe(
        'The module this run kept writing about',
      )
      expect(placement.kind === 'in' && placement.primary.support).toBe(2)
    })

    /**
     * DIRECTION IS PART OF THE MEANING. A `part_of` link stored from the project to the run says the
     * PROJECT is part of the run — "has part", read from the run's end — which is a different claim
     * and not the one that files a run. It still places the run, as any link does. It does not win.
     */
    it('does not promote a `part_of` link stored the other way round', () => {
      const claimed = pipeline('A pipeline somebody linked backwards')
      const mod = module_('The module this run relates to')
      const run = session('a run with a link pointing at it')

      db.api.createLink({ fromId: claimed.id, toId: run.id, type: 'part_of', actor: HUMAN })
      db.api.createLink({ fromId: run.id, toId: mod.id, type: 'relates_to', actor: HUMAN })
      wroteTowards(run, mod, ['Something the run wrote about the module'])

      const placement = placementOf(run)
      expect(placement.kind).toBe('in')
      if (placement.kind !== 'in') return
      // Read from this run's end that link says "has part", so it is an ordinary statement and the
      // module's two claims carry it.
      expect(placement.primary.project.title).toBe('The module this run relates to')
      const backwards = placement.also[0]?.evidence
      expect(backwards !== undefined && backwards.how === 'link' ? backwards.word : null).toBe('has part')
    })

    /**
     * The word this rule ranks is the vocabulary's, not a string this rule keeps a copy of. If a
     * fourteenth link type ever read "part of" from the far end, two types would win the same
     * argument for different reasons and nothing else would notice.
     */
    it('ranks a word the link vocabulary owns, and exactly one type says it', () => {
      expect(sessions.BELONGING_WORD).toBe(LINK_TYPES.part_of.forward)
      const saying = Object.entries(LINK_TYPES).filter(
        ([, words]) => words.forward === sessions.BELONGING_WORD || words.reverse === sessions.BELONGING_WORD,
      )
      expect(saying.map(([type]) => type)).toEqual(['part_of'])
    })
  })
})

// ================================================== the placement, and the workspace, over HTTP

/**
 * WHAT AN AGENT WRITING THROUGH THE API CAN NOW READ BACK ABOUT ITS OWN RUN.
 *
 * Each of these was a measured piece of friction from the night seven agents recorded their own
 * work in Mole Office: the placement reached no endpoint, `session.workspace` was accepted and read by
 * nothing, and a session's clock moved when its record was edited rather than when it wrote.
 */
describe('the session reply says where a run is filed, and what was written about it', () => {
  aFreshDatabaseForThisCase()

  let app: FastifyInstance

  async function serve() {
    const { sessionRoutes } = await import('../src/server/api/sessions.ts')
    const { installErrorHandling } = await import('../src/server/lib/http.ts')
    app = Fastify()
    installErrorHandling(app)
    await app.register(sessionRoutes, { prefix: '/api', env: () => envWith() })
    await app.ready()
    return app
  }

  afterEach(async () => {
    if (app) await app.close()
  })

  const body = (res: { body: string }) => JSON.parse(res.body) as Record<string, any>
  const human = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const

  it('carries the placement on every row, on the session’s own endpoint, and the rule beside it', async () => {
    const gripper = db.api.createRecord({ workspaceId: 'default', kind: 'module', title: 'Tray clamp', actor: human })
    const run = db.api.createRecord({ workspaceId: 'default',
      kind: 'session',
      title: 'calib · setting 13 force capture',
      data: { state: 'running' },
      actor: human,
    })
    db.api.createLink({ fromId: run.id, toId: gripper.id, type: 'part_of', actor: human })

    const server = await serve()
    const list = body(await server.inject({ method: 'GET', url: '/api/sessions' }))
    const row = list['sessions'][0]
    expect(row['placement']['kind']).toBe('in')
    expect(row['placement']['primary']['project']['title']).toBe('Tray clamp')
    expect(row['placement']['primary']['sentence']).toContain('“part of”')
    // The rule itself, served, so nothing has to read a React component to find out what places a
    // run — and what it read to answer, so a short answer can be told from a small database.
    expect(list['placementRule']).toContain('a typed link to a block')
    expect(list['placementRead']['projects']).toBe(1)

    const detail = body(await server.inject({ method: 'GET', url: `/api/sessions/${run.id}` }))
    expect(detail['session']['placement']['primary']['project']['id']).toBe(gripper.id)
    expect(detail['placementRule']).toBe(list['placementRule'])
  })

  /**
   * THE RULE THAT RUNS HAS TO BE THE RULE THE REPLY PUBLISHES. An author whose run was regrouped
   * needs to be able to read, from the answer itself, that its own `part_of` is what decided it and
   * that no other word carries that weight — otherwise the ranking is a rule they can only discover
   * by experiment, which is how the placement rule was learned by reading a React component.
   */
  it('publishes the one word it ranks beside the answer that used it', async () => {
    const pipe = db.api.createRecord({ workspaceId: 'default', kind: 'pipeline', title: 'The pass this run is part of', actor: human })
    const mod = db.api.createRecord({ workspaceId: 'default', kind: 'module', title: 'The module it wrote about', actor: human })
    const run = db.api.createRecord({ workspaceId: 'default',
      kind: 'session',
      title: 'a run that said where it belonged',
      data: { state: 'running' },
      actor: human,
    })
    db.api.createLink({ fromId: run.id, toId: pipe.id, type: 'part_of', actor: human })
    db.api.createLink({ fromId: run.id, toId: mod.id, type: 'relates_to', actor: human })
    const found = db.api.createRecord({ workspaceId: 'default',
      kind: 'problem',
      title: 'something it found in the module',
      actor: { type: 'agent', id: 'claude-code', sessionId: run.id },
    })
    db.api.createLink({ fromId: found.id, toId: mod.id, type: 'about', actor: human })

    const server = await serve()
    const list = body(await server.inject({ method: 'GET', url: '/api/sessions' }))
    const row = list['sessions'][0]

    expect(row['placement']['primary']['project']['title']).toBe('The pass this run is part of')
    // What lost is on the same row, with the count that used to win it.
    expect(row['placement']['also'][0]['project']['title']).toBe('The module it wrote about')
    expect(row['placement']['also'][0]['support']).toBe(2)
    // And the rule served beside it says what just happened, including that this is one word and not
    // an order over the vocabulary.
    expect(list['placementRule']).toContain('“part of”')
    expect(list['placementRule']).toContain('equal to every other')
    expect(list['placementRule']).toContain('a typed link to a block')
  })

  it('says what the link it just made did to the placement, in the same reply', async () => {
    const pipe = db.api.createRecord({ workspaceId: 'default', kind: 'pipeline', title: 'Overnight pass', actor: human })
    const { block } = db.blocks.addBlock(pipe.id, { name: 'Audit the roadmap', state: 'doing' }, human)
    const run = db.api.createRecord({ workspaceId: 'default',
      kind: 'session',
      title: 'roadmap-audit-recorder',
      data: { state: 'running' },
      actor: human,
    })

    const server = await serve()
    const out = body(
      await server.inject({
        method: 'POST',
        url: `/api/sessions/${run.id}/link`,
        payload: { toTitle: block.title, type: 'part_of' },
      }),
    )
    // The reply used to say only that the association existed. It says where the run stands now.
    expect(out['placement']['primary']['project']['title']).toBe('Overnight pass')
    expect(out['note']).toContain('Where this run is now filed:')
    expect(out['note']).toContain('the pipeline “Overnight pass” holds that block')
  })

  it('reads back the workspace a session was asked for, and says it was not observed', async () => {
    db.api.createRecord({ workspaceId: 'default',
      kind: 'session',
      title: 'a run that filled in the field the schema asks for',
      data: { state: 'running', workspace: 'proj_1st_baseline' },
      actor: human,
    })

    const server = await serve()
    const row = body(await server.inject({ method: 'GET', url: '/api/sessions' }))['sessions'][0]
    // Accepted, stored and — until this pass — read by nothing: eight sessions filed in one night
    // all sent it and all reported `cwd: null`.
    expect(row['workspace']).toEqual({ name: 'proj_1st_baseline', from: 'recorded', path: null })
    // And it is still not a working directory. Nobody observed one, so `cwd` stays null.
    expect(row['cwd']).toBeNull()
  })

  it('keeps an agent name that no adapter answers to out of `tool`', async () => {
    db.api.createRecord({ workspaceId: 'default',
      kind: 'session',
      title: 'dogfood-synthesis',
      data: { state: 'running', runtime: 'claude-code (opus-5)' },
      actor: human,
    })

    const server = await serve()
    const row = body(await server.inject({ method: 'GET', url: '/api/sessions' }))['sessions'][0]
    // `tool` is the name of the thing that can read this session's log. "claude-code (opus-5)" is
    // not one, and reporting it as one produced a tool name no adapter will ever match.
    expect(row['tool']).toBe('unrecorded')
    expect(row['recordedAgent']).toBe('claude-code (opus-5)')
  })

  it('moves a run’s clock when the run writes, not when its record is edited', async () => {
    const run = db.api.createRecord({ workspaceId: 'default',
      kind: 'session',
      title: 'a busy run with no log on disk',
      data: { state: 'running' },
      actor: human,
    })
    // Filed an hour ago, so "when its record was last touched" and "when it last wrote" are
    // different moments and the answer has to choose between them.
    const anHourAgo = '2026-08-08 11:00:00'
    db.client.sqlite.prepare('update records set updated_at = ? where id = ?').run(anHourAgo, run.id)

    const server = await serve()
    const before = body(await server.inject({ method: 'GET', url: '/api/sessions' }))['sessions'][0]
    expect(before['lastActivityAt']).toBe(anHourAgo)
    expect(before['lastActivityFrom']).toBe('record-updated')

    // The run writes a record. Nothing edits the session record.
    db.api.createRecord({ workspaceId: 'default',
      kind: 'problem',
      title: 'something the run found',
      actor: { type: 'agent', id: 'claude-code', sessionId: run.id },
    })

    const after = body(await server.inject({ method: 'GET', url: '/api/sessions' }))['sessions'][0]
    expect(after['lastActivityFrom']).toBe('change-log')
    expect(after['lastActivityAt'] > anHourAgo).toBe(true)
    // Said on the row, because a clock that comes from somewhere other than the state word is
    // exactly the pair a reader would otherwise assume agree.
    expect(after['stateReason']).toContain('newest row it wrote')
  })
})

// ============================================================================== reading a stamp

/**
 * WHAT `stampOf` MAY CLAIM ABOUT A RECORD IT DID NOT WRITE.
 *
 * A discovery sweep writes every field of the stamp. Nothing else has to: an agent may write
 * `data.extra.discovered` through the API, and two test files in this repository do exactly that
 * with three fields. `stampOf` used to check three keys and hand back whatever was stored, cast to
 * the full shape, so every other field was a promise nobody had checked.
 *
 * These are tests of what the reader may claim, not of the shape a sweep happens to write. If the
 * stamp ever becomes declared fields of the `session` kind — which the file header asks for — the
 * validation moves to the schema and these tests move with it rather than being deleted.
 */
describe('the reader of a discovery stamp hands back only what it checked', () => {
  aFreshDatabaseForThisCase()

  /** A session record carrying exactly the stamp given, and nothing else in `extra`. */
  function stamped(stamp: Record<string, unknown>) {
    return db.api.createRecord({
      kind: 'session',
      title: 'a run with a stamp somebody else wrote',
      data: { state: 'idle', runtime: 'claude-code', extra: { [DISCOVERY_KEY]: stamp } },
      workspaceId: 'default',
      actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id },
    })
  }

  const conversation = { tool: 'claude-code', externalId: 'abc', logPath: '/tmp/does-not-matter.jsonl' }

  it('turns the fields nobody wrote into null, an empty list and false', () => {
    const stamp = sessions.stampOf(stamped(conversation))
    expect(stamp?.tool).toBe('claude-code')
    expect(stamp?.resumeCommand).toBeNull()
    expect(stamp?.startedAt).toBeNull()
    expect(stamp?.entryPoint).toBeNull()
    expect(stamp?.observedState).toBeNull()
    expect(stamp?.stateReason).toBeNull()
    expect(stamp?.at).toBeNull()
    expect(stamp?.filesTouched).toEqual([])
    expect(stamp?.filesComplete).toBe(false)
  })

  it('refuses to call a list complete when there is no list', () => {
    // `filesComplete` means "these are all the files it touched". With no list stored, saying true
    // would claim an empty list is the whole answer.
    const stamp = sessions.stampOf(stamped({ ...conversation, filesComplete: true }))
    expect(stamp?.filesComplete).toBe(false)
  })

  it('drops a state word that is not one an observer can report', () => {
    const stamp = sessions.stampOf(stamped({ ...conversation, observedState: 'busy-ish' }))
    expect(stamp?.observedState).toBeNull()
  })

  it('still treats a stamp that cannot name its conversation as absent', () => {
    expect(sessions.stampOf(stamped({ tool: 'claude-code', externalId: 'abc' }))).toBeNull()
    expect(sessions.stampOf(stamped({ tool: 'claude-code', logPath: '/tmp/x.jsonl' }))).toBeNull()
  })
})
