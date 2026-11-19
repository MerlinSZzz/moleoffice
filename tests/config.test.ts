// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE JUDGEMENT CALLS, AS CONFIGURATION.
 *
 * Two numbers decide what the sessions page CLAIMS about every session on the machine, and one
 * list decides where the resource ledger is allowed to look for lock files. None of them is a
 * measurement; all of them are somebody's opinion, so all of them are settable per machine.
 *
 * The property these tests exist for is the refusal. A threshold that quietly fell back to its
 * default when the value was malformed would relabel every session on the page, and nothing
 * about the page would look wrong — no error, no gap, just different words. So the tests below
 * care less about "5m parses to 300" than about what happens to "5 minutes", "2", "0s" and an
 * orphan threshold shorter than the idle one: each has to stop the server with the variable
 * named and an example shown.
 *
 * The import-time test is the one that proves it happens at STARTUP rather than on first use.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { vi } from 'vitest'
import { AGENT, freshDb, type TestDb } from './helpers.ts'
import { settingNamed } from '../src/config/settings.mjs'
import { thePortsATestKeepsOff } from '../tools/live-office-ports.mjs'
import { DEFAULT_WORKSPACE } from '../src/shared/workspaces.ts'
import {
  DEFAULT_IDLE_AFTER,
  DEFAULT_ORPHAN_AFTER,
  IDLE_AFTER_VAR,
  ORPHAN_AFTER_VAR,
  claudeCodeAdapter,
  defaultEnv,
  describeThresholds,
  parseDuration,
  readThresholds,
} from '../src/server/lib/adapters/index.ts'
import type { AdapterEnv, ProcessScan } from '../src/server/lib/adapters/types.ts'
import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'

// ================================================================================== durations

describe('a duration is read exactly, or not at all', () => {
  it('reads the four units the documentation promises', () => {
    expect(parseDuration('30s', IDLE_AFTER_VAR)).toBe(30)
    expect(parseDuration('5m', IDLE_AFTER_VAR)).toBe(300)
    expect(parseDuration('2h', ORPHAN_AFTER_VAR)).toBe(7200)
    expect(parseDuration('1d', ORPHAN_AFTER_VAR)).toBe(86_400)
  })

  it('ignores surrounding whitespace, which .env files collect', () => {
    expect(parseDuration('  2h  ', ORPHAN_AFTER_VAR)).toBe(7200)
  })

  it('refuses a bare number rather than guessing which unit was meant', () => {
    // MOLE_OFFICE_ORPHAN_AFTER=2 almost certainly means two hours. Reading it as two seconds would
    // mark every quiet session orphaned, and the page would look entirely normal doing it.
    const err = expectMessage(() => parseDuration('2', ORPHAN_AFTER_VAR))
    expect(err).toContain(ORPHAN_AFTER_VAR)
    expect(err).toContain('not a duration')
    expect(err).toContain(`${ORPHAN_AFTER_VAR}=5m`)
  })

  it.each(['5 minutes', 'five', '5x', '', '-3m', '1.5h', '2h30m', 'm5'])(
    'refuses %o, naming the variable and showing an example',
    (bad) => {
      const err = expectMessage(() => parseDuration(bad, IDLE_AFTER_VAR))
      expect(err).toContain(IDLE_AFTER_VAR)
      expect(err).toContain('5m')
    },
  )

  it('refuses zero, which would put every session permanently past the threshold', () => {
    const err = expectMessage(() => parseDuration('0s', IDLE_AFTER_VAR))
    expect(err).toContain('zero')
    expect(err).toContain(IDLE_AFTER_VAR)
  })

  it('says out loud that it will not fall back to a default', () => {
    const err = expectMessage(() => parseDuration('soon', ORPHAN_AFTER_VAR))
    expect(err).toContain('will not start')
  })
})

// ================================================================================= thresholds

describe('the two thresholds are configuration, and the defaults are 5 minutes and 2 hours', () => {
  it('uses 5m and 2h when nothing is set, and says they are the built-in defaults', () => {
    const t = readThresholds({})
    expect(t.idleAfterSeconds).toBe(5 * 60)
    expect(t.orphanAfterSeconds).toBe(2 * 60 * 60)
    expect(t.idleAfter).toBe(DEFAULT_IDLE_AFTER)
    expect(t.orphanAfter).toBe(DEFAULT_ORPHAN_AFTER)
    expect(t.idleConfigured).toBe(false)
    expect(t.orphanConfigured).toBe(false)
  })

  it('takes the configured values, and records that they were configured', () => {
    const t = readThresholds({ [IDLE_AFTER_VAR]: '90s', [ORPHAN_AFTER_VAR]: '1d' })
    expect(t.idleAfterSeconds).toBe(90)
    expect(t.orphanAfterSeconds).toBe(86_400)
    expect(t.idleConfigured).toBe(true)
    expect(t.orphanConfigured).toBe(true)
  })

  it('one may be set without the other', () => {
    const t = readThresholds({ [ORPHAN_AFTER_VAR]: '45m' })
    expect(t.idleAfterSeconds).toBe(5 * 60)
    expect(t.orphanAfterSeconds).toBe(45 * 60)
    expect(t.idleConfigured).toBe(false)
    expect(t.orphanConfigured).toBe(true)
  })

  it('names the offending variable, not just "a threshold"', () => {
    const err = expectMessage(() => readThresholds({ [ORPHAN_AFTER_VAR]: 'ages' }))
    expect(err).toContain(ORPHAN_AFTER_VAR)
    expect(err).not.toContain(`${IDLE_AFTER_VAR} is`)
  })

  it('refuses an orphan threshold at or below the idle one, which would delete "cannot tell yet"', () => {
    const err = expectMessage(() =>
      readThresholds({ [IDLE_AFTER_VAR]: '2h', [ORPHAN_AFTER_VAR]: '30m' }),
    )
    expect(err).toContain(IDLE_AFTER_VAR)
    expect(err).toContain(ORPHAN_AFTER_VAR)
    expect(err).toContain('must be longer')

    expect(() => readThresholds({ [IDLE_AFTER_VAR]: '5m', [ORPHAN_AFTER_VAR]: '300s' })).toThrow()
  })

  it('describes the effective values with both numbers and both variable names', () => {
    const line = describeThresholds(readThresholds({ [ORPHAN_AFTER_VAR]: '3h' }))
    expect(line).toContain('5m')
    expect(line).toContain('300s')
    expect(line).toContain('3h')
    expect(line).toContain('10800s')
    expect(line).toContain(IDLE_AFTER_VAR)
    expect(line).toContain(ORPHAN_AFTER_VAR)
    // Which of the two somebody set is part of the answer to "why did it say that".
    expect(line).toContain(`set by ${ORPHAN_AFTER_VAR}`)
    expect(line).toContain('built-in default')
  })
})

describe('a malformed threshold stops the server at startup, not at first page load', () => {
  const saved: Record<string, string | undefined> = {}

  beforeEach(() => {
    saved[IDLE_AFTER_VAR] = process.env[IDLE_AFTER_VAR]
    saved[ORPHAN_AFTER_VAR] = process.env[ORPHAN_AFTER_VAR]
  })

  afterEach(() => {
    for (const key of [IDLE_AFTER_VAR, ORPHAN_AFTER_VAR]) {
      const was = saved[key]
      if (was === undefined) delete process.env[key]
      else process.env[key] = was
    }
    vi.resetModules()
  })

  /**
   * Loading the adapters module IS the startup check: the server reaches it while registering
   * its routes, before it listens. Importing it with a bad value has to throw, because a lazily
   * read threshold would surface as a 500 from whichever page happened to be opened first,
   * hours after the person who edited .env had stopped looking.
   */
  it('throws while the module is being imported', async () => {
    process.env[ORPHAN_AFTER_VAR] = 'a while'
    vi.resetModules()
    await expect(import('../src/server/lib/adapters/index.ts')).rejects.toThrow(ORPHAN_AFTER_VAR)
  })

  it('imports cleanly again once the value is a duration', async () => {
    process.env[ORPHAN_AFTER_VAR] = '90m'
    vi.resetModules()
    const mod = await import('../src/server/lib/adapters/index.ts')
    expect(mod.ORPHAN_AFTER_SECONDS).toBe(90 * 60)
    expect(mod.defaultEnv().orphanAfterSeconds).toBe(90 * 60)
  })
})

// ============================================================== the thresholds reach the ladder

/**
 * The numbers are only worth configuring if they change the word on the page, so this drives the
 * real adapter with the real configured environment and one hand-written transcript.
 */
describe('the configured thresholds are what the state ladder actually uses', () => {
  let home: string

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'mole-office-config-'))
  })

  afterEach(() => {
    rmSync(home, { recursive: true, force: true })
  })

  const NOW = new Date('2026-08-08T12:00:00Z')
  const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString()

  /** One transcript with a single prompt in it, timestamped, and its path. */
  function writeLog(id: string, at: string): string {
    const path = join(home, `${id}.jsonl`)
    writeFileSync(
      path,
      JSON.stringify({
        parentUuid: null,
        isSidechain: false,
        type: 'user',
        message: { role: 'user', content: 'sweep the force tables' },
        timestamp: at,
        userType: 'external',
        cwd: `${THE_TEST_FIXTURE_ROOT}/checkout`,
        version: '2.1.223',
      }) + '\n',
    )
    return path
  }

  /** The real defaults, on a machine with a known home directory and nothing running. */
  function env(overrides: Partial<AdapterEnv> = {}): AdapterEnv {
    const empty: ProcessScan = { ok: true, processes: [] }
    return defaultEnv({ homeDir: home, now: NOW, scanProcesses: () => empty, ...overrides })
  }

  it('carries 5 minutes and 2 hours into every environment built for the real machine', () => {
    expect(defaultEnv().runningWithinSeconds).toBe(5 * 60)
    expect(defaultEnv().orphanAfterSeconds).toBe(2 * 60 * 60)
  })

  it('calls a session quiet for three hours orphaned — the old 6h default called it unknown', () => {
    const id = 'cccccccc-0000-0000-0000-000000000001'
    const path = writeLog(id, hoursAgo(3))

    const observed = claudeCodeAdapter.observe({ externalId: id, logPath: path }, env())
    expect(observed.state).toBe('orphaned')

    // The same evidence, judged by the threshold that was there before this change.
    const under6h = claudeCodeAdapter.observe(
      { externalId: id, logPath: path },
      env({ orphanAfterSeconds: 6 * 60 * 60 }),
    )
    expect(under6h.state).toBe('unknown')
  })

  it('still refuses to call a one-hour gap orphaned, so the band that says "cannot tell" survives', () => {
    const id = 'cccccccc-0000-0000-0000-000000000002'
    const observed = claudeCodeAdapter.observe(
      { externalId: id, logPath: writeLog(id, hoursAgo(1)) },
      env(),
    )
    expect(observed.state).toBe('unknown')
  })
})

// ================================================================================= lock paths

describe('lock paths are configurable, are a boundary, and nothing here ever deletes one', () => {
  let t: TestDb
  let res: typeof import('../src/server/lib/resources.ts')
  let saved: string | undefined
  let dir: string

  beforeAll(async () => {
    t = await freshDb()
    res = await import('../src/server/lib/resources.ts')
  }, 60_000)

  afterAll(() => {
    t.close()
  })

  beforeEach(() => {
    saved = process.env.MOLE_OFFICE_LOCK_PATHS
    dir = mkdtempSync(join(tmpdir(), 'mole-office-locks-'))
  })

  afterEach(() => {
    if (saved === undefined) delete process.env.MOLE_OFFICE_LOCK_PATHS
    else process.env.MOLE_OFFICE_LOCK_PATHS = saved
    rmSync(dir, { recursive: true, force: true })
  })

  /** A session record to hang resources off, since the ledger is owned by sessions. */
  function session(title = 'a session that started things'): string {
    return t.api.createRecord({ workspaceId: 'default', kind: 'session', title, data: { state: 'running' }, actor: AGENT }).id
  }

  it('defaults to /tmp and /var/lock', () => {
    delete process.env.MOLE_OFFICE_LOCK_PATHS
    expect(res.configuredLockPaths()).toEqual(['/tmp', '/var/lock'])
  })

  it('takes a colon-separated list, like PATH', () => {
    process.env.MOLE_OFFICE_LOCK_PATHS = '/tmp:/var/lock:/run/lock'
    expect(res.configuredLockPaths()).toEqual(['/tmp', '/var/lock', '/run/lock'])
  })

  it('normalises a trailing slash, which would otherwise be a boundary nothing is inside', () => {
    process.env.MOLE_OFFICE_LOCK_PATHS = `${dir}/`
    expect(res.configuredLockPaths()).toEqual([dir])

    // And the normalisation is the boundary's, not just the listing's.
    const id = session()
    const entry = res.registerResource({
      workspaceId: 'default',
      sessionRecordId: id,
      type: 'lock',
      key: join(dir, 'job.lock'),
      actor: AGENT,
    })
    expect(entry.key).toBe(join(dir, 'job.lock'))
  })

  it('honours an empty value as "watch nothing" rather than reverting to the defaults', () => {
    process.env.MOLE_OFFICE_LOCK_PATHS = ''
    expect(res.configuredLockPaths()).toEqual([])
  })

  it('refuses a relative path instead of resolving it against the working directory', () => {
    process.env.MOLE_OFFICE_LOCK_PATHS = 'tmp/locks'
    expect(() => res.configuredLockPaths()).toThrow('MOLE_OFFICE_LOCK_PATHS')
  })

  it('refuses to register a lock outside the configured paths, and says how to widen them', () => {
    process.env.MOLE_OFFICE_LOCK_PATHS = dir
    const id = session()
    try {
      res.registerResource({
        workspaceId: 'default',
        sessionRecordId: id,
        type: 'lock',
        key: '/etc/somewhere-else.lock',
        actor: AGENT,
      })
      throw new Error('registering a lock outside the configured paths should have been refused')
    } catch (err) {
      expect(err).toBeInstanceOf(t.api.PanelError)
      expect((err as Error).message).toContain('MOLE_OFFICE_LOCK_PATHS')
    }
  })

  it('does not let a sibling directory pass as being inside a configured one', () => {
    // "/tmp/locks" must not admit "/tmp/locksmith/x.lock" on a plain prefix match.
    process.env.MOLE_OFFICE_LOCK_PATHS = join(dir, 'locks')
    const id = session()
    expect(() =>
      res.registerResource({
        workspaceId: 'default',
        sessionRecordId: id,
        type: 'lock',
        key: join(dir, 'locksmith', 'x.lock'),
        actor: AGENT,
      }),
    ).toThrow('not under any configured lock path')
  })

  it('NEVER deletes a lock file: releasing one is refused and tells you to look at it yourself', async () => {
    process.env.MOLE_OFFICE_LOCK_PATHS = dir
    const path = join(dir, 'sweep.lock')
    writeFileSync(path, 'pid 1234\n')
    const id = session()
    const entry = res.registerResource({ workspaceId: 'default', sessionRecordId: id, type: 'lock', key: path, actor: AGENT })

    await expect(res.releaseResource(entry.id, { actor: AGENT }, 'default')).rejects.toThrow(
      'will not delete lock files',
    )
    // Refused, and the file is still there — which is the whole point: it may be the only
    // evidence a job is running, and a second copy started on the same data is worse.
    expect(res.configuredLockPaths()).toEqual([dir])
    const still = res.listResources({ workspaceId: 'default', sessionRecordId: id })
    expect(still.length).toBe(1)
    expect(still[0]?.releasedAt).toBe(null)
  })
})

// ============================================================ the knobs, and where they are found

/**
 * EVERY SETTING THE CODE READS IS IN .env.example, AND EVERYTHING IN THERE IS READ.
 *
 * This is the same defect as every other one this suite guards, in its cheapest form: two places
 * that must agree, with nothing making them. The two are the source and the template, and both
 * directions of disagreement cost something real.
 *
 * A variable the code reads and the template does not mention is a knob nobody can FIND. The
 * thresholds above are in .env.example precisely because they are judgements, and "a judgement
 * nobody can find is one nobody can argue with" — the same is true of where a scan is pointed.
 *
 * A variable in the template that nothing reads is worse, because it will be set and then
 * believed. `MOLE_OFFICE_MIRROR=./data/mirror` sat in there naming a feature this project has never
 * had, next to variables that work, in the file you are told to copy before your first run.
 *
 * Read from the source rather than from a list kept here: a hand-maintained list of the
 * variables would be a third copy, and the point of this test is that there are not three.
 */
describe('.env.example and the declaration agree about what Mole Office reads', () => {
  const root = fileURLToPath(new URL('..', import.meta.url))
  const template = readFileSync(join(root, '.env.example'), 'utf8')

  /** Every name the template mentions at all, assigned or shown commented out as an example. */
  const mentioned = new Set(
    [...template.matchAll(/^#?\s*([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1] as string),
  )

  /**
   * THE CHECK THAT USED TO BE HERE COULD NOT SEE A MISSING NAME THAT WAS A PREFIX OF A PRESENT ONE.
   *
   * It asked `template.includes(name)`, a substring test. `MOLE_OFFICE_WEB` was read by three tools
   * and named nowhere in `.env.example`, and the test passed for weeks because the file contains
   * `MOLE_OFFICE_WEB_PORT`. Found on 3 September 2026 while building the declaration. Both checks
   * above match a whole assignment, so a name can no longer hide inside a longer one.
   */
  it('does not let one setting hide inside a longer one', () => {
    expect(mentioned.has('MOLE_OFFICE_WEB_PORT')).toBe(true)
    expect(mentioned.has('MOLE_OFFICE_WEB')).toBe(false)
  })
})

/**
 * Everything outside a comment, so that prose about a number is not read as the number.
 *
 * Deliberately crude: it removes `/* … *​/` blocks and `// …` lines and does not understand a
 * comment marker inside a string. That is the safe direction to be wrong in — a string wrongly
 * treated as a comment could hide a real fallback — so the two `//` cases it would get wrong,
 * `http://` and `https://`, are protected before the line comments are cut.
 *
 * ---------------------------------------------------------------------------------------
 * THE GUARD USED TO CONTAIN THE THING IT WAS GUARDING AGAINST, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * Problem `y2UKUJEqHLVp`, found by the fifth GROUND verifier on 4 September 2026. The guard
 * replaced `http://` with `https` followed by a NUL byte followed by `//`. That still holds a
 * `//`, so `indexOf('//')` found the guard itself and cut the line there. Every line holding a URL
 * was truncated at the URL, and everything after it — the host, the port, the rest of the
 * statement — was gone before any caller looked at it.
 *
 * What that cost: `tests/one-configuration-source.test.ts` reads every file through this function,
 * and a hardcoded Mole Office address planted in `tools/where-is-the-api.mjs` left it green at 68
 * of 68. The check named *is the only file that writes a Mole Office address into its code* could
 * not see an address written into code, which is the one fault criterion G1 exists for.
 *
 * The guard now holds no slashes at all: the scheme, then a NUL byte. It also keeps the scheme it
 * was given rather than assuming `http`, which the old restore did not — it rewrote every
 * `https://` in every file it read as `http://`.
 */
export function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => {
      const guarded = line.replace(/(https?):\/\//g, '$1\u0000')
      const at = guarded.indexOf('//')
      const kept = at === -1 ? guarded : guarded.slice(0, at)
      return kept.replace(/(https?)\u0000/g, '$1://')
    })
    .join('\n')
}

/**
 * THE STRIPPER ITSELF, ON LINES THAT HOLD A URL, A COMMENT, AND BOTH.
 *
 * Eleven test files read source through `withoutComments` and none of them tested it. The defect it
 * carried was invisible in every one of them, because a check that cannot see a fault reports the
 * same green as a codebase that does not have one.
 */
describe('the comment stripper keeps the code and removes the comment', () => {
  it('keeps a URL that is part of the code', () => {
    const line = "  return found === null ? 'http://127.0.0.1:8787' : found"
    expect(withoutComments(line)).toBe(line)
  })

  it('keeps the scheme it was given, rather than making every address an http one', () => {
    const line = "  const home = 'https://example.test/x'"
    expect(withoutComments(line)).toBe(line)
  })

  it('removes a line comment', () => {
    expect(withoutComments('  const port = 3 // the port this machine uses')).toBe('  const port = 3 ')
  })

  it('removes a line comment that is itself about a URL', () => {
    expect(withoutComments('  const port = 3 // see http://127.0.0.1:8787')).toBe('  const port = 3 ')
  })

  it('keeps the URL in the code and removes the comment after it, on one line', () => {
    const line = "  const home = 'http://127.0.0.1:5173' // where the browser app answers"
    expect(withoutComments(line)).toBe("  const home = 'http://127.0.0.1:5173' ")
  })

  it('still removes a block comment', () => {
    expect(withoutComments('const a = 1 /* http://127.0.0.1:8787 */ + 2')).toBe('const a = 1   + 2')
  })

  /**
   * THE FAULT, IN THE WORDS OF THE CHECK THAT COULD NOT SEE IT.
   *
   * This is the line the fifth verifier planted in `tools/where-is-the-api.mjs`, read with the two
   * patterns `tests/one-configuration-source.test.ts` hunts it with. Before the fix the stripped
   * line held neither the address nor the port, so both patterns found nothing.
   */
  it('leaves a hardcoded address where a check reading through it can find it', () => {
    const planted = "  return found === undefined || found === null ? 'http://127.0.0.1:8787' : found"
    const stripped = withoutComments(planted)
    expect(/(127\.0\.0\.1|localhost|0\.0\.0\.0):(8787|5173)\b/.test(stripped)).toBe(true)
    expect(/\b(8787|5173)\b/.test(stripped)).toBe(true)
  })
})

// ---------------------------------------------------------------------------- small assertion

/**
 * Run something that must throw, and hand back the message.
 *
 * A test that only asserted "it threw" would pass on a TypeError from a typo, and these
 * refusals are judged on what they SAY — the variable's name and a working example.
 */
function expectMessage(fn: () => unknown): string {
  try {
    const value = fn()
    throw new Error(`expected a refusal, but the call returned ${JSON.stringify(value)}`)
  } catch (err) {
    if (!(err instanceof Error)) throw new Error(`expected an Error, got ${String(err)}`)
    if (err.message.startsWith('expected a refusal')) throw err
    return err.message
  }
}

// =============================================== the ports are declared once, and read from there

/**
 * NO PORT NUMBER IS WRITTEN INTO THIS SERVER, IN A MESSAGE OR ANYWHERE ELSE.
 *
 * WHAT THIS SECTION USED TO SAY, AND WHY IT IS TURNED ROUND. It asserted that
 * `src/server/index.ts` still contained the exact source line `process.env.MOLE_OFFICE_WEB_PORT ??
 * '5173'` — "the one place the number is allowed to appear: the fallback, beside the variable it
 * falls back FROM" — and noted that vite.config.ts held the same default. That is the defect
 * CLAUDE.md names at the top of the file, protected by a test: the same fact in two places, free to
 * disagree, with nothing failing when they do. Criterion G1 of design/ground/ACCEPTANCE.md says no
 * hardcoded fallback port survives anywhere and that a test greps for one and fails, so the
 * assertion is now the opposite one.
 *
 * WHAT IT STILL PROTECTS, unchanged: the two messages this server prints about the BROWSER APP had
 * 5173 typed into them, and somebody who had moved the app was sent to a dead address by the only
 * process that could have told them the right one — the 404 on a non-/api URL, and the line printed
 * at startup. Both are built from the setting now, and this says so without naming a number.
 *
 * A grep rather than a request, because src/server/index.ts listens on a socket the moment it is
 * imported. What a grep can prove is the thing that actually went wrong: a port number written into
 * a sentence instead of read from the declaration that owns it.
 */
describe('the server writes no port number into a message and holds no default of its own', () => {
  const root = fileURLToPath(new URL('..', import.meta.url))
  const index = readFileSync(join(root, 'src/server/index.ts'), 'utf8')
  /** The file with its comments removed, so prose about the past is not read as code. */
  const code = withoutComments(index)

  it('names no fixed browser-app address', () => {
    expect(code).not.toContain('localhost:5173')
    expect(code).not.toContain('127.0.0.1:5173')
  })

  it('holds no fallback port of its own, for either half of npm run dev', () => {
    // The exact shape this file carried until 3 September 2026, in both halves.
    expect(code).not.toContain("MOLE_OFFICE_PORT ?? '8787'")
    expect(code).not.toContain("MOLE_OFFICE_WEB_PORT ?? '5173'")
    // The two defaults, and the live offices' ports as tools/live-office-ports.mjs reads them.
    for (const port of new Set(['8787', '5173', ...thePortsATestKeepsOff().map(String)])) {
      expect(code, `src/server/index.ts writes the port ${port} into its code`).not.toMatch(
        new RegExp(`\\b${port}\\b`),
      )
    }
  })

  it('takes both ports from the one declaration instead', () => {
    expect(code).toContain("from '../config/settings.mjs'")
    expect(code).toContain("portFrom(process.env, 'MOLE_OFFICE_PORT')")
    // The browser app's address is the declaration's too, so the 404 and the startup line move with
    // MOLE_OFFICE_WEB_PORT without this file knowing what that setting's default is.
    expect(code).toContain('settings().webAddress')
  })
})

// ============================================================================ the deleted database

/**
 * TROUBLESHOOTING.MD'S TOP ENTRY, AND THE FIRST TEST IT HAS EVER HAD.
 *
 * "An orphaned server holds the port and serves stale data — it once caused a wrong diagnosis."
 * Four occurrences. SQLite holds its file by open DESCRIPTOR, so a server started before
 * `npm run db:reset` goes on reading and writing the DELETED file, and every one of its answers
 * looks completely normal. The occurrence that cost the most produced a written-down conclusion
 * that the API was dropping fields on write. It was not: there were two databases and two
 * servers.
 *
 * The entry's own "how to tell it is back" — "results that change depending on which process
 * answered" — is not a thing a test can watch for. This is: the server can notice that the file
 * it is serving is no longer the file at MOLE_OFFICE_DB, which is the same fact one step earlier and
 * the one a person can act on. GET /api/health carries it.
 */
describe('a server whose database file has been deleted or replaced says so', () => {
  let dir: string
  let file: string
  let client: typeof import('../src/server/db/client.ts')

  beforeEach(async () => {
    vi.resetModules()
    dir = mkdtempSync(join(tmpdir(), 'mole-office-dbfile-'))
    file = join(dir, 'panelx.db')
    process.env.MOLE_OFFICE_DB = file
    client = await import('../src/server/db/client.ts')
  })

  afterEach(() => {
    if (client.sqlite.open) client.sqlite.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('says nothing while the file is the file it opened', () => {
    const status = client.databaseFileStatus()
    expect(status.ok).toBe(true)
  })

  it('reads the stored value after the registered connection closes, without calling its dead handle', async () => {
    client.sqlite.exec("CREATE TABLE runtime_settings (name TEXT PRIMARY KEY, value TEXT NOT NULL); INSERT INTO runtime_settings VALUES ('MOLE_OFFICE_REPLY_REMINDER_MINUTES', '9')")
    const { readSettingHere } = await import('../src/config/settings.mjs')
    expect(readSettingHere('MOLE_OFFICE_REPLY_REMINDER_MINUTES').value).toBe('9')
    client.sqlite.close()
    const after = readSettingHere('MOLE_OFFICE_REPLY_REMINDER_MINUTES')
    expect(after.value).toBe('9')
    expect(after.source).toBe('the office database')
  })

  it('names the delete rather than answering normally out of a removed inode', () => {
    rmSync(file)
    const status = client.databaseFileStatus()
    expect(status.ok).toBe(false)
    if (status.ok) throw new Error('unreachable')
    expect(status.problem).toContain('DELETED')
    expect(status.problem).toContain(file)
    // The reader has to be told what to do, and the two habits in troubleshooting.md are the
    // answer: stop it by process GROUP and start it again.
    expect(status.problem).toContain('process GROUP')
  })

  it('notices a db:reset that put a different file at the same path', () => {
    // What `npm run db:reset` does: remove the file and create a new one. Same path, new inode,
    // and the running server is still on the old one.
    rmSync(file)
    writeFileSync(file, '')
    const status = client.databaseFileStatus()
    expect(status.ok).toBe(false)
    if (status.ok) throw new Error('unreachable')
    expect(status.problem).toContain('DIFFERENT database file')
  })
})

// ================================================================================== the default project

describe('the default project is one project', () => {
  it('is the same word for a command-line tool as for a request that names no project', () => {
    // FLO-02 of a decision. The settings declaration
    // (JavaScript, read by the session hook on Node 18) cannot import src/shared/workspaces.ts
    // (TypeScript), so the word is written in both places. This holds them to one value: a tool with
    // no MOLE_OFFICE_WORKSPACE and a request with no
    // project header file into the same project, and neither names the owner's own.
    expect(settingNamed('MOLE_OFFICE_WORKSPACE').fallback).toBe(DEFAULT_WORKSPACE)
    expect(DEFAULT_WORKSPACE).toBe('default')
  })
})
