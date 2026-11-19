// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PRODUCT KNOWS ITS OWN RUNTIME — criterion G2 of design/ground/ACCEPTANCE.md.
 *
 * The state to prevent: a real API and a scratch API side by side, a browser still pointing at the
 * scratch database, and health checks that appear green. Every one of those is a fact about a
 * running process, and until now nothing could be asked for any of them. `GET /api/health` said the
 * database file and nothing else.
 *
 * WHAT THESE TESTS ARE ABOUT, in order of how much they matter:
 *
 * 1. **Nothing is cached.** The strongest one, and the reason it is first. A runtime record built
 *    at startup would be right until the moment it mattered. Two of the tests below change the
 *    world under a running server and read the change back out of the next reply.
 * 2. **Scratch is told from canonical, with the reasons.** "It is scratch" without the reason is
 *    the answer a person argues with.
 * 3. **What could not be read is named.** A null field always has a sentence beside it.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import type { RuntimeRecord } from '../src/shared/runtime.ts'
import { AGENT, freshDb, type TestDb } from './helpers.ts'
import { REPO_ROOT } from '../src/config/settings.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

describe('a server can be asked what it is', () => {
  let t: TestDb
  let app: Awaited<ReturnType<typeof import('./helpers.ts').apiApp>>

  beforeEach(async () => {
    t = await freshDb()
    const { apiApp } = await import('./helpers.ts')
    app = await apiApp()
  })

  afterEach(async () => {
    await app.app.close()
    t.close()
  })

  async function runtime(): Promise<RuntimeRecord> {
    const res = await app.app.inject({ method: 'GET', url: '/api/runtime' })
    expect(res.statusCode, res.body).toBe(200)
    return res.json() as RuntimeRecord
  }

  it('names the process answering, its group, and how long it has been up', async () => {
    const r = await runtime()
    expect(r.process.pid).toBe(process.pid)
    // The group is what a release signals, so a record without it cannot support one.
    expect(typeof r.process.pgid === 'number' || r.couldNotRead.length > 0).toBe(true)
    expect(r.process.underTestRunner).toBe(true)
    expect(r.readAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/)
  })

  it('names the checkout, its commit and whether the tree is dirty', async () => {
    const r = await runtime()
    expect(r.repository.path).toBe(REPO_ROOT.replace(/\/$/, ''))
    expect(r.repository.path).toBe(ROOT.replace(/\/$/, ''))
    expect(r.repository.head, 'git could not be read; see couldNotRead').not.toBeNull()
    expect(r.repository.head?.short.length).toBeGreaterThan(6)
    expect(r.repository.head?.full.length).toBe(40)
    expect(r.repository.head?.full.startsWith(r.repository.head.short)).toBe(true)
    expect(typeof r.repository.dirty).toBe('boolean')
    // This test runs in a worktree during a gate and in the main checkout otherwise, so the
    // ASSERTION is that the question was answered, not which way.
    expect(r.repository.isWorktree === true || r.repository.isWorktree === false).toBe(true)
  })

  it('names the database it has open, and says it is not the canonical one', async () => {
    const r = await runtime()
    expect(r.database.path).toBe(resolve(t.file))
    expect(r.database.canonical).toBe(false)
    expect(r.database.canonicalPath).not.toBe(r.database.path)
    expect(r.database.problem).toBeNull()
  })

  it('says this is scratch, and every reason', async () => {
    const r = await runtime()
    expect(r.standing.kind).toBe('scratch')
    expect(r.standing.because.join(' | ')).toContain('test runner')
    expect(r.standing.because.join(' | ')).toContain(r.database.path)
    // Each reason is a sentence somebody can act on, not a code.
    for (const because of r.standing.because) expect(because.length).toBeGreaterThan(20)
  })

  it('says nobody registered it, which is a real answer and a worse one than a name', async () => {
    const r = await runtime()
    expect(r.startedBy.registered).toBe(false)
    expect(r.startedBy.says).toBe('nobody registered this process')
    expect(r.startedBy.sessionRecordId).toBeNull()
  })

  it('reads the owner again on the next request rather than remembering it', async () => {
    // NOTHING IS CACHED, asked in the way that matters: the world changes under a running server
    // and the next reply carries the change. A record built once at startup would pass every other
    // test in this file.
    const before = await runtime()
    expect(before.startedBy.registered).toBe(false)

    const session = t.api.createRecord({
      workspaceId: 'default',
      kind: 'session',
      title: 'the session that started this server',
      data: { state: 'running' },
      actor: AGENT,
    })
    const res = await app.app.inject({
      method: 'POST',
      url: '/api/resources',
      headers: {
        'x-mole-office-actor-type': 'agent',
        'x-mole-office-actor-id': 'vitest',
        'x-mole-office-session': session.id,
        'x-mole-office-workspace': 'default',
      },
      payload: { type: 'process', key: String(process.pid), detail: 'the server under test', adopting: 'this test process started before the session the test filed for it' },
    })
    expect(res.statusCode, res.body).toBe(201)

    const after = await runtime()
    expect(after.startedBy.registered).toBe(true)
    expect(after.startedBy.sessionRecordId).toBe(session.id)
    expect(after.startedBy.says).toContain('the session that started this server')
    // Nobody recorded that Mole Office started it, and that is not the same as "no".
    expect(after.startedBy.startedByTheProduct).toBeNull()
  })

  it('notices the database file being replaced under it, on the next request', async () => {
    // troubleshooting.md's top entry, asked of the runtime record: SQLite holds its file by open
    // descriptor, so a server whose database was deleted goes on answering normally out of a
    // removed inode. Four occurrences; the worst produced a written-down conclusion that the API
    // was dropping fields on write.
    expect((await runtime()).database.problem).toBeNull()
    rmSync(t.file)
    const after = await runtime()
    expect(after.database.problem).toContain('DELETED')
    expect(after.database.problem).toContain(resolve(t.file))
  })

  it('says whether the code it loaded is as new as the checkout, with both times', async () => {
    const r = await runtime()
    expect(['as new as the checkout', 'older than the checkout', 'unknown']).toContain(r.freshness.verdict)
    if (r.freshness.verdict !== 'unknown') {
      expect(r.freshness.newestLoaded).toMatch(/^\d{4}-\d{2}-\d{2} /)
      expect(r.freshness.newestOnDisk).toMatch(/^\d{4}-\d{2}-\d{2} /)
      expect(r.freshness.newestOnDiskFile).toMatch(/^src\//)
      expect(r.freshness.says).toContain(String(r.freshness.newestOnDisk))
    }
  })

  it('names what it could not read, and never leaves a null bare', async () => {
    const r = await runtime()
    expect(Array.isArray(r.couldNotRead)).toBe(true)
    for (const gap of r.couldNotRead) {
      expect(gap.what.length).toBeGreaterThan(3)
      expect(gap.why.length).toBeGreaterThan(10)
    }
    // The rule this file states: a null field has a matching sentence. The fields that may be null
    // on a healthy read are checked together, because a run on a machine with no git would have
    // several at once.
    const nulls = [
      r.repository.head === null,
      r.repository.dirty === null,
      r.repository.isWorktree === null,
      r.process.pgid === null,
    ].filter(Boolean).length
    if (nulls > 0) expect(r.couldNotRead.length).toBeGreaterThan(0)
  })

  it('carries the settings this world was read from, and where each value came from', async () => {
    const r = await runtime()
    expect(r.settings.envFile.endsWith('.env')).toBe(true)
    expect(r.settings.sources['MOLE_OFFICE_DB']).toBe('the environment')
    // THE DECLARED ADDRESS, which is the one this test is about: it is a setting, and this is the
    // test of the settings. The address the server ANSWERS on is the next test's, and it is not a
    // setting at all.
    expect(r.addresses.declaredApi).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
    expect(r.addresses.web).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
  })

  /**
   * WHETHER A KIMI RUN HAS A KEY, WITHOUT THE RECORD EVER HOLDING ONE.
   *
   * Until 6 September 2026 nothing in Mole Office said how a Kimi run got a key, so the owner's key
   * sat in `.env` under a name Kimi CLI does not read and nobody was told. Problem oY8Vs5feaRai.
   * This is the reading a person can act on, and the second test is the one that keeps it safe.
   *
   * THE KEY USED HERE IS MADE UP AND SET ON THIS PROCESS. Nothing in these tests reads the owner's
   * real key, and asserting on a made-up one is what makes the second test provable at all: a
   * record that leaked a value would have to leak this one.
   */
  describe('what it says about a Kimi run’s key', () => {
    const madeUp = 'not-a-real-key-for-the-runtime-record-test'
    let before: string | undefined

    beforeEach(() => {
      before = process.env['KIMI_API_KEY']
      process.env['KIMI_API_KEY'] = madeUp
    })

    afterEach(() => {
      if (before === undefined) delete process.env['KIMI_API_KEY']
      else process.env['KIMI_API_KEY'] = before
    })

    it('says a key is set, and under which name, in the two words and never the key', async () => {
      const r = await runtime()
      expect(r.kimi.key).toBe('set')
      expect(r.kimi.keyFrom).toBe('KIMI_API_KEY')
      // A KEY ON ITS OWN IS NOT ENOUGH, and the sentence says so rather than reading as ready.
      expect(r.kimi.says).toContain('A Kimi key is set')
      expect(Array.isArray(r.kimi.missing)).toBe(true)
      expect(Array.isArray(r.kimi.refused)).toBe(true)
    })

    it('never puts the key itself anywhere in the record, at any depth', async () => {
      const r = await runtime()
      // THE WHOLE RECORD AS IT GOES OVER THE WIRE. A field added later that carried a value would
      // fail here without anybody having to remember this rule.
      expect(JSON.stringify(r)).not.toContain(madeUp)
    })

  })

  /**
   * THE SAME READING, ASKED OF ENVIRONMENTS BUILT HERE RATHER THAN OF THIS MACHINE.
   *
   * The route above cannot be asked what it says when NOTHING is set, because deleting a name from
   * `process.env` does not reach `.env` — the trap `src/config/settings.mjs` documents, which cost a
   * red suite on 28 August 2026. So the states are asked of the reader directly, with an environment
   * that is empty because it was built empty. No value here is real.
   */
  describe('what it makes of a Kimi environment, built one state at a time', () => {
    const madeUp = 'not-a-real-key-either'

    it('says no key is set when neither name is set, and names both places one could come from', async () => {
      const { kimiKeys } = await import('../src/server/lib/runtime.ts')
      const said = kimiKeys({})
      expect(said.key).toBe('not set')
      expect(said.keyFrom).toBeNull()
      expect(said.missing).toEqual(['KIMI_API_KEY', 'KIMI_BASE_URL', 'KIMI_MODEL_NAME'])
      expect(said.says).toContain('KIMI_API_KEY')
      expect(said.says).toContain('MOONSHOT_API_KEY')
      expect(said.says).toContain('cannot reach a model')
    })

    it('names MOONSHOT_API_KEY when that is the only one set, and says Kimi CLI does not read it', async () => {
      const { kimiKeys } = await import('../src/server/lib/runtime.ts')
      const said = kimiKeys({ MOONSHOT_API_KEY: madeUp })
      expect(said.key).toBe('set')
      expect(said.keyFrom).toBe('MOONSHOT_API_KEY')
      // THE MAPPING IS THE POINT: the owner's key did nothing under the name the owner gave it until the adapter
      // carried it across, so the sentence has to say the carrying happens.
      expect(said.says).toContain('does not read MOONSHOT_API_KEY')
      expect(said.says).toContain('as KIMI_API_KEY')
      // A KEY ALONE IS NOT ENOUGH, and the two that are still missing are named.
      expect(said.missing).toEqual(['KIMI_BASE_URL', 'KIMI_MODEL_NAME'])
      expect(said.says).not.toContain(madeUp)
    })

    it('says everything is there when all three are, and stops saying a run would fail', async () => {
      const { kimiKeys } = await import('../src/server/lib/runtime.ts')
      const said = kimiKeys({
        KIMI_API_KEY: madeUp,
        KIMI_BASE_URL: 'https://example.invalid/v1',
        KIMI_MODEL_NAME: 'a-model-that-does-not-exist',
      })
      expect(said.key).toBe('set')
      expect(said.keyFrom).toBe('KIMI_API_KEY')
      expect(said.missing).toEqual([])
      expect(said.says).toContain('everything else it needs')
      expect(said.says).not.toContain('LLM not set')
      expect(said.says).not.toContain(madeUp)
    })

    it('counts a name set to an empty value apart from one nobody set', async () => {
      const { kimiKeys } = await import('../src/server/lib/runtime.ts')
      const said = kimiKeys({ KIMI_API_KEY: madeUp, KIMI_BASE_URL: '' })
      expect(said.refused).toEqual(['KIMI_BASE_URL'])
      // AND IT IS NOT SILENTLY READ AS ABSENT: the sentence says which name is malformed.
      expect(said.says).toContain('set to an empty value')
    })
  })

  /**
   * THE ADDRESS IS READ OFF THE SOCKET, SO A SERVER THAT BOUND NONE HAS NONE.
   *
   * This app is built by `apiApp()` and driven with `inject`: it never listens, so nothing can have
   * reached it at any address. It used to answer with the declared one, and problem `ES5fb2_BHsVn`
   * is what that cost — a scratch server started from the live checkout reported the live
   * checkout's address as the one it was answering on.
   */
  it('says it answers on no address when it has bound no socket, and says why', async () => {
    const r = await runtime()
    expect(r.addresses.api).toBeNull()
    // Null is never bare here, which is this file's third rule.
    const gap = r.couldNotRead.find((one) => one.what === 'the address this server answers on')
    expect(gap, 'a null address with no sentence beside it').toBeDefined()
    expect(gap?.why).toContain('has not bound a socket')
    // And nothing claims a disagreement between a socket that does not exist and a declaration.
    expect(r.addresses.says).toBeNull()
  })
})

/**
 * THE TWO ADDRESSES THE PAGE COMPARES ITSELF AGAINST, READ FROM A SETTINGS FILE THIS TEST WROTE.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS NOT ASSERTED AGAINST THE CHECKOUT'S OWN `.env`
 * ---------------------------------------------------------------------------------------
 *
 * `addresses.canonicalWeb` and `addresses.canonicalWebForOtherMachines` are read from the checkout's
 * settings file alone, ignoring the shell, because the question they answer is *was this page opened
 * on an address of the real Mole Office* and only the checkout can answer it. That makes them the two
 * fields no test could put a value in front of: in a checkout with no address for other machines the
 * honest answer is null, and a field that has been broken to return null always looks exactly the
 * same.
 *
 * Measured on 4 September 2026 by the seventh verifier: make `canonicalWebForOtherMachines` always
 * null and `tests/the-page-shouts-when-it-is-in-the-wrong-world.test.ts` and
 * `tests/the-negative-control.test.ts` stay green 46 of 46, while a page opened over the address for
 * other machines and answered by a copy of the database draws nothing — which is the defect commit
 * `9ef878e` exists to fix. Problem `HmFM3B8A7k12`.
 *
 * So `addresses` takes the settings file it reads, defaulting to the real one, and this test writes
 * two of them: one naming an address for other machines and one naming none. Nothing in the checkout
 * is touched and the answer does not depend on how it is configured.
 */
describe('the addresses the page compares itself against come from the checkout settings', () => {
  let dir = ''

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mole-office-runtime-addresses-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  /** A settings file of this test's own, and the path to it. */
  function envFileSaying(lines: string[]): string {
    const file = join(dir, `.env-${String(lines.length)}-${String(Math.random()).slice(2)}`)
    writeFileSync(file, `${lines.join('\n')}\n`)
    return file
  }

  async function addressesReadFrom(file: string): Promise<RuntimeRecord['addresses']> {
    const { Gaps, addresses } = await import('../src/server/lib/runtime.ts')
    const { settings } = await import('../src/config/settings.mjs')
    return addresses(new Gaps(), settings(), file)
  }

  it('names the canonical browser app for other machines when the settings name an address', async () => {
    const file = envFileSaying([
      'MOLE_OFFICE_PORT=29901',
      'MOLE_OFFICE_WEB_PORT=29902',
      'MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES=192.0.2.10',
    ])
    const read = await addressesReadFrom(file)
    // The web port and the address, joined by the declaration and not by this test: the page uses
    // this to decide whether the address it was opened on is the real Mole Office's.
    expect(read.canonicalWebForOtherMachines).toBe('http://192.0.2.10:29902')
    expect(read.canonicalWeb).toBe('http://127.0.0.1:29902')
  })

  it('says null when the settings name none, which is a reading and not a gap', async () => {
    const file = envFileSaying(['MOLE_OFFICE_PORT=29903', 'MOLE_OFFICE_WEB_PORT=29904'])
    const read = await addressesReadFrom(file)
    expect(read.canonicalWebForOtherMachines).toBe(null)
    expect(read.canonicalWeb).toBe('http://127.0.0.1:29904')
  })

  it('moves the canonical remote address when the web port moves, because both come from one file', async () => {
    const read = await addressesReadFrom(
      envFileSaying(['MOLE_OFFICE_WEB_PORT=29905', 'MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES=a-name']),
    )
    expect(read.canonicalWebForOtherMachines).toBe('http://a-name:29905')
  })
})

describe('the freshness verdict, without touching a file in the checkout', () => {
  it('calls a checkout that has not moved as new as the code that was loaded', async () => {
    const { freshnessBetween } = await import('../src/server/lib/runtime.ts')
    const at = new Date('2026-09-03T10:00:00')
    const f = freshnessBetween(
      { at, file: 'src/shared/time.ts', files: 199 },
      { at, file: 'src/shared/time.ts', files: 199 },
    )
    expect(f.verdict).toBe('as new as the checkout')
    expect(f.staleSince).toBeNull()
    // THE SENTENCE NAMES WHAT THE SERVER IS BUILT FROM, AND HOW MANY FILES THAT IS. It said
    // "nothing under src/" until problem `aI9V57-ZTyv0` and then named three folders until
    // `TMy3C0ydoYYR`; neither is what the server is judged against.
    expect(f.says).toContain('none of the 199 files this server is built from has changed since')
    expect(f.filesTheServerIsBuiltFrom).toBe(199)
  })

  it('calls a server older than the checkout, and says since when and which file', async () => {
    const { freshnessBetween } = await import('../src/server/lib/runtime.ts')
    const f = freshnessBetween(
      { at: new Date('2026-09-03T10:00:00'), file: 'src/shared/time.ts', files: 199 },
      { at: new Date('2026-09-03T10:05:00'), file: 'src/shared/runtime.ts', files: 199 },
      // WHEN IT WAS FIRST FOUND BEHIND, which is what `staleSince` means. It is handed in rather
      // than worked out from the file times: the newest file's time is the LAST change and moves
      // every time somebody saves, which is problem `PxJuVufHG6A2`.
      new Date('2026-09-03T10:06:30'),
    )
    expect(f.verdict).toBe('older than the checkout')
    expect(f.staleSince).toContain('10:06:30')
    // Not the newest file's own time, which is the number this used to report.
    expect(f.staleSince).not.toContain('10:05')
    expect(f.newestOnDiskFile).toBe('src/shared/runtime.ts')
    expect(f.says).toContain('serving older code')
  })

  it('says it does not know since when, rather than guessing, when nothing has recorded a moment', async () => {
    const { freshnessBetween } = await import('../src/server/lib/runtime.ts')
    const f = freshnessBetween(
      { at: new Date('2026-09-03T10:00:00'), file: 'src/shared/time.ts', files: 199 },
      { at: new Date('2026-09-03T10:05:00'), file: 'src/shared/runtime.ts', files: 199 },
      null,
    )
    expect(f.verdict).toBe('older than the checkout')
    expect(f.staleSince).toBeNull()
  })

  /**
   * THE CLOCK ITSELF: WHEN THIS PROCESS WAS FIRST FOUND BEHIND THE CHECKOUT.
   *
   * Problem `PxJuVufHG6A2`. The count used to start at the newest file's modification time, so a
   * server that had been behind for an hour reported three seconds while somebody was saving files,
   * and both readers built on it — the red banner and the ok flag on GET /api/health — went quiet
   * in exactly the case where somebody is working.
   */
  it('keeps the first moment it was found behind, however many readings follow', async () => {
    const { whenThisProcessWasFirstFoundBehind, forgetWhenThisProcessWentBehind } = await import(
      '../src/server/lib/runtime.ts'
    )
    forgetWhenThisProcessWentBehind()
    const first = new Date('2026-09-03T10:00:00')
    expect(whenThisProcessWasFirstFoundBehind(true, first)).toEqual(first)
    // Four more readings, minutes apart, each of them still behind. The moment does not move.
    for (const minutes of [1, 5, 30, 60]) {
      const later = new Date(first.getTime() + minutes * 60_000)
      expect(whenThisProcessWasFirstFoundBehind(true, later)).toEqual(first)
    }
    // A RELOAD IS WHAT CLEARS IT: the process picks the change up, the reading is no longer behind,
    // and a staleness that starts later starts from later.
    expect(whenThisProcessWasFirstFoundBehind(false, new Date(first.getTime() + 90 * 60_000))).toBeNull()
    const afterwards = new Date(first.getTime() + 120 * 60_000)
    expect(whenThisProcessWasFirstFoundBehind(true, afterwards)).toEqual(afterwards)
    forgetWhenThisProcessWentBehind()
  })

  it('is not behind at all when either reading is missing, so nothing starts a clock', async () => {
    const { isBehindTheCheckout } = await import('../src/server/lib/runtime.ts')
    const one = { at: new Date('2026-09-03T10:00:00') }
    expect(isBehindTheCheckout(null, one)).toBe(false)
    expect(isBehindTheCheckout(one, null)).toBe(false)
    expect(isBehindTheCheckout(one, { at: new Date('2026-09-03T10:05:00') })).toBe(true)
  })

  it('ignores a change inside the same second, which is a restart and not staleness', async () => {
    const { freshnessBetween } = await import('../src/server/lib/runtime.ts')
    const f = freshnessBetween(
      { at: new Date('2026-09-03T10:00:00.100'), file: 'a', files: 1 },
      { at: new Date('2026-09-03T10:00:00.900'), file: 'a', files: 1 },
    )
    expect(f.verdict).toBe('as new as the checkout')
  })

  it('answers unknown rather than fresh when either side could not be read', async () => {
    const { freshnessBetween } = await import('../src/server/lib/runtime.ts')
    // The failure that matters: nothing could be read, and the honest answer is not "fresh".
    expect(freshnessBetween(null, { at: new Date(), file: 'a', files: 1 }).verdict).toBe('unknown')
    expect(freshnessBetween({ at: new Date(), file: 'a', files: 1 }, null).verdict).toBe('unknown')
  })
})
