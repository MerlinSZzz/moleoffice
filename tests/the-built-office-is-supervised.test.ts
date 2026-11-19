// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SUPERVISOR IN `--built` MODE: A PAGE CHANGE REBUILDS, A SERVER CHANGE RESTARTS.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS PROVES
 * ---------------------------------------------------------------------------------------
 *
 * S1 of design/ground/ACCEPTANCE.md section 9. `npm run serve` runs this mode: the page is built
 * before the first start, the API is started in production to serve the built page on its own port,
 * a change to a file the API is built from restarts the API, a change to a file the PAGE is built
 * from rebuilds the page and leaves the API alone, and a build that fails keeps the last good page
 * serving and files one note naming the file it failed on.
 *
 * The two changes are routed by two SETS walked from the two entries — the same walk the freshness
 * door uses — so the distinction is not a folder and not a list somebody maintains. This test
 * chooses one file that is only the page's (`src/web/App.tsx`) and one that is only the server's
 * (`src/server/lib/health.ts`), which is what makes the two directions separable.
 *
 * ---------------------------------------------------------------------------------------
 * IT MAKES ITS OWN CHECKOUT, AND IT IS DELIBERATELY SLOW
 * ---------------------------------------------------------------------------------------
 *
 * It copies the parts a server and a build need into a temporary directory and runs the real
 * supervisor there, exactly as tests/the-dev-supervisor-does-not-lose-its-own-server.test.ts does.
 * Nothing in this checkout is touched: a build writes `dist/web`, and a test must not move the
 * owner's built page or the file times every other server in the same run reads.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import {
  cpSync,
  existsSync,
  readFileSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { commandThatStopsWithItsOwner } from './helpers.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms))

/** A port the operating system picks and nothing else is holding. */
function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const probe = createServer()
    probe.on('error', fail)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      if (address === null || typeof address === 'string') {
        probe.close(() => fail(new Error('the probe socket reported no port')))
        return
      }
      const { port } = address
      probe.close(() => done(port))
    })
  })
}

let dir = ''
let api = ''
let apiPort = 0
let webPort = 0
let supervisor: ChildProcess | null = null
let supervisorGroup: number | null = null
let output = ''

/** What each act saw. Filled in `beforeAll`; the tests below only read it. */
const seen = {
  firstPid: 0,
  pidAfterThePageChange: 0,
  pidAfterTheServerChange: 0,
  rebuildsBeforeThePageChange: 0,
  rebuildsAfterThePageChange: 0,
  restartsBeforeThePageChange: 0,
  restartsAfterThePageChange: 0,
  rebuildsBeforeTheServerChange: 0,
  rebuildsAfterTheServerChange: 0,
  restartsAfterTheServerChange: 0,
  freshnessAtTheStart: null as { builtPage: { verdict: string } } | null,
  pageIndexBeforeTheFailedBuild: '',
  pageIndexAfterTheFailedBuild: '',
  theFileTheFailedBuildNamed: '',
  theNoteAboutTheFailedBuild: null as { title: string; body: string } | null,
}

const howMany = (what: string): number => output.split('\n').filter((line) => line.includes(what)).length

async function read(what: string): Promise<Record<string, unknown> | null> {
  try {
    const answered = await fetch(`http://127.0.0.1:${String(apiPort)}${what}`, {
      headers: { 'x-mole-office-workspace': 'default' },
      signal: AbortSignal.timeout(4000),
    })
    if (!answered.ok) return null
    return (await answered.json()) as Record<string, unknown>
  } catch {
    return null
  }
}

async function thePid(): Promise<number> {
  const record = (await read('/api/runtime')) as { process?: { pid?: number } } | null
  return record?.process?.pid ?? 0
}

/** Wait until `test` is happy, or say what the last reading was. */
async function until(
  test: () => boolean | Promise<boolean>,
  what: string,
  within = 120_000,
): Promise<void> {
  const stop = Date.now() + within
  while (Date.now() < stop) {
    if (await test()) return
    await sleep(250)
  }
  throw new Error(`${what} did not happen within ${String(within / 1000)}s. The supervisor said:\n${output}`)
}

/** Wait until the API on the scratch stack answers, under this supervisor. */
async function untilItAnswers(within = 120_000): Promise<void> {
  const stop = Date.now() + within
  while (Date.now() < stop) {
    const record = (await read('/api/runtime')) as { supervisor?: { watching?: boolean } } | null
    if (record?.supervisor?.watching === true) return
    await sleep(250)
  }
  throw new Error(`no server under this supervisor answered within ${String(within / 1000)}s. It said:\n${output}`)
}

/** Move a file's modification time, which is the whole of what a watcher and the door read. */
function touch(path: string, when = new Date()): void {
  utimesSync(path, when, when)
}

beforeAll(async () => {
  dir = aTestDatabaseFolder('built-supervisor')
  for (const part of ['src', 'tools', 'for-agents', 'drizzle', 'public', 'package.json', 'tsconfig.json', 'vite.config.ts']) {
    cpSync(join(REPO, part), join(dir, part), { recursive: true })
  }
  symlinkSync(join(REPO, 'node_modules'), join(dir, 'node_modules'))

  apiPort = await freePort()
  webPort = await freePort()
  api = `http://127.0.0.1:${String(apiPort)}`
  const watched = commandThatStopsWithItsOwner(process.execPath, ['tools/serve-dev.mjs', '--built'])
  supervisor = spawn(watched.command, watched.args, {
    cwd: dir,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      MOLE_OFFICE_PORT: String(apiPort),
      MOLE_OFFICE_WEB_PORT: String(webPort),
      MOLE_OFFICE_DB: join(dir, 'watched.db'),
      MOLE_OFFICE_WORKSPACE: 'default',
      LOG_LEVEL: 'warn',
      VITEST: undefined,
      VITEST_WORKER_ID: undefined,
    } as NodeJS.ProcessEnv,
  })
  supervisorGroup = supervisor.pid ?? null
  supervisor.stdout?.on('data', (chunk: Buffer) => (output += chunk.toString()))
  supervisor.stderr?.on('data', (chunk: Buffer) => (output += chunk.toString()))

  await untilItAnswers()
  seen.firstPid = await thePid()
  const first = (await read('/api/runtime/freshness')) as { freshness: { builtPage: { verdict: string } } } | null
  seen.freshnessAtTheStart = first?.freshness ?? null

  // ------------------------------------------------- ACT 1: A PAGE FILE, WHICH MUST REBUILD ONLY
  seen.rebuildsBeforeThePageChange = howMany('[dev] rebuilding the page:')
  seen.restartsBeforeThePageChange = howMany('[dev] restarting the server:')
  touch(join(dir, 'src/web/App.tsx'))
  await until(() => howMany('[dev] rebuilding the page:') > seen.rebuildsBeforeThePageChange, 'the page rebuild to begin')
  seen.pidAfterThePageChange = await thePid()
  seen.rebuildsAfterThePageChange = howMany('[dev] rebuilding the page:')
  seen.restartsAfterThePageChange = howMany('[dev] restarting the server:')
  // The rebuild finishing is what makes the freshness door fresh again; wait for it.
  await until(
    () => howMany('[dev] the page was rebuilt. The API was not restarted.') >= seen.rebuildsAfterThePageChange,
    'the page rebuild to finish',
  )

  // ------------------------------------------------ ACT 2: A SERVER FILE, WHICH MUST RESTART ONLY
  seen.rebuildsBeforeTheServerChange = howMany('[dev] rebuilding the page:')
  const beforeTheServerChange = await thePid()
  touch(join(dir, 'src/server/lib/health.ts'))
  await until(() => howMany('[dev] restarting the server:') > seen.restartsAfterThePageChange, 'the server restart to begin')
  await untilItAnswers()
  seen.pidAfterTheServerChange = await thePid()
  seen.restartsAfterTheServerChange = howMany('[dev] restarting the server:')
  seen.rebuildsAfterTheServerChange = howMany('[dev] rebuilding the page:')
  void beforeTheServerChange

  // ------------------------------------------- ACT 3: A BUILD THAT FAILS KEEPS THE LAST GOOD PAGE
  const thePage = join(dir, 'dist/web/index.html')
  seen.pageIndexBeforeTheFailedBuild = readFileSync(thePage, 'utf8')
  const served = join(dir, 'src/web/lib/served.ts')
  const wasGood = readFileSync(served, 'utf8')
  const beforeTheFailure = howMany('[dev] the page build failed')
  writeFileSync(served, `${wasGood}\nthis is not valid ( and never was\n`)
  await until(
    () => howMany('[dev] the page build failed') > beforeTheFailure,
    'the failing build to be reported',
    120_000,
  )
  seen.pageIndexAfterTheFailedBuild = readFileSync(thePage, 'utf8')
  const named = /\[dev\] the page build failed on ([^\s]+)/.exec(output)
  seen.theFileTheFailedBuildNamed = named?.[1]?.replace(/\.$/, '') ?? ''
  // ONE NOTE, NAMING THE FILE. The supervisor files it through the API it is already serving.
  await until(
    async () => {
      const listed = (await read('/api/records?kind=note&shape=full')) as { records?: { title: string; data?: { body?: string } }[] } | null
      const note = listed?.records?.find((one) => one.title.startsWith('The built page did not build:'))
      if (note === undefined) return false
      seen.theNoteAboutTheFailedBuild = { title: note.title, body: note.data?.body ?? '' }
      return true
    },
    'the note about the failed build to be filed',
    60_000,
  )
  // PUT THE GOOD FILE BACK, so the scratch is not left broken for anything after this.
  writeFileSync(served, wasGood)
}, 300_000)

afterAll(async () => {
  try {
    if (supervisorGroup !== null) {
      const group = supervisorGroup
      const ended = () => {
        try { process.kill(-group, 0); return false }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ESRCH') return true
          throw error
        }
      }
      if (!ended()) {
        process.kill(-group, 'SIGTERM')
        try { await until(ended, 'the recorded supervisor group to end', 3000) }
        catch {
          if (!ended()) process.kill(-group, 'SIGKILL')
          await until(ended, 'the recorded supervisor group to end after SIGKILL', 5000)
        }
      }
    }
  } finally {
    if (dir !== '') rmSync(dir, { recursive: true, force: true })
  }
})

describe('a change to a page file rebuilds the page and leaves the API alone', () => {
  it('rebuilt, and said the API was not restarted', () => {
    expect(seen.rebuildsAfterThePageChange).toBeGreaterThan(seen.rebuildsBeforeThePageChange)
    expect(output).toContain('[dev] the page was rebuilt. The API was not restarted.')
  })

  it('did not restart the API: the same process is answering', () => {
    expect(seen.pidAfterThePageChange).toBe(seen.firstPid)
    expect(seen.restartsAfterThePageChange).toBe(seen.restartsBeforeThePageChange)
  })

  it('started with a built page the freshness door calls as new as the checkout', () => {
    expect(seen.freshnessAtTheStart?.builtPage.verdict).toBe('as new as the checkout')
  })
})

describe('a change to a server file restarts the API and does not rebuild the page', () => {
  it('restarted the API: a new process is answering', () => {
    expect(seen.pidAfterTheServerChange).not.toBe(seen.firstPid)
    expect(seen.pidAfterTheServerChange).toBeGreaterThan(0)
    expect(seen.restartsAfterTheServerChange).toBeGreaterThan(seen.restartsAfterThePageChange)
  })

  it('did not rebuild the page', () => {
    expect(seen.rebuildsAfterTheServerChange).toBe(seen.rebuildsBeforeTheServerChange)
  })
})

describe('a build that fails keeps the last good page serving and files one note', () => {
  it('left the last good index.html exactly as it was', () => {
    expect(seen.pageIndexBeforeTheFailedBuild).not.toBe('')
    expect(seen.pageIndexAfterTheFailedBuild).toBe(seen.pageIndexBeforeTheFailedBuild)
    expect(existsSync(join(dir, 'dist/web/assets'))).toBe(true)
  })

  it('named the file the build failed on', () => {
    expect(seen.theFileTheFailedBuildNamed).toContain('src/web/lib/served.ts')
    expect(output).toContain('The last good build is still being served.')
  })

  it('filed one note in the office naming the failing file', () => {
    expect(seen.theNoteAboutTheFailedBuild).not.toBeNull()
    expect(seen.theNoteAboutTheFailedBuild?.title).toContain('src/web/lib/served.ts')
    expect(seen.theNoteAboutTheFailedBuild?.body).toContain('last good build')
  })
})
