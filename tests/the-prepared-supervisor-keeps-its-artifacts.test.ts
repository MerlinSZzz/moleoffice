// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PREPARED SUPERVISOR START KEEPS ITS OWN ARTIFACTS.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS PROVES
 * ---------------------------------------------------------------------------------------
 *
 * `tools/serve-dev.mjs --built --prepared` starts from a page already built at exactly this
 * checkout, without a build before the first start, and refuses before anything listens when the
 * artifacts do not match. The criterion is written in
 * `tests/the-prepared-supervisor-keeps-its-artifacts.criteria.md`. It follows the approval
 * `gIgeyzM2_S2r`, forwarded as `tx15hfOt0Anu` in report `o7eNVeIJWuvS`, and the
 * refinement `l5IvD5HyPdph`.
 *
 * The cases, each named for its mutant in the criterion document:
 *   1. plain `--built` still builds the page before the first start;
 *   2. `--prepared` without `--built` is refused in one sentence, before anything listens;
 *   3. missing output, a missing stamp, an unreadable stamp and a stamp with no commit are each
 *      refused before anything listens;
 *   4. a stamp naming another commit, a commit Git cannot resolve, and a checkout Git cannot read
 *      are each refused before anything listens, with no fallback;
 *   5. uncommitted changes in the files the page is built from are refused before anything listens;
 *   6. the check reads this checkout even when the Git environment points at another repository,
 *      and refuses a root that is not the top level of its own repository;
 *   7. the Git the check runs is given literal path handling, so no page path can be read as
 *      pathspec syntax;
 *   8. a matching prepared build skips the build before the first start; and
 *   9. a later page-file change still rebuilds under `--prepared`.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS AND IS NOT
 * ---------------------------------------------------------------------------------------
 *
 * The builder is injected and counts its calls, so 1, 6 and 7 are unit evidence about the call
 * counting and the refusals. They are NOT a rehearsal of the real `vite build`, and this file
 * claims no real build. The server child is a stand-in that answers `{}` and writes `.starts`, as
 * `tests/the-dev-supervisor-does-not-lose-its-own-server.test.ts` also uses, so no real office and
 * no real database runs here. Every scratch checkout is made under the operating system's
 * temporary folder and removed again.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { spawnSync } from 'node:child_process'
import {
  appendFileSync,
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { createServer as createHttpServer } from 'node:http'
import { createServer as createTcpServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { serveDev } from '../tools/serve-dev.mjs'
import { THE_BUILD_STAMP_FILE } from '../src/config/settings.mjs'
import { THE_PUBLIC_FOLDER } from '../src/config/import-graph.mjs'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms))

type ServeOptions = NonNullable<Parameters<typeof serveDev>[0]>

interface CountingBuild {
  calls: number
  roots: string[]
}

/** A port the operating system picks and nothing else is holding. */
function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const probe = createTcpServer()
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

/**
 * A listening HTTP server that answers `{}` on a port this test chose. The refusal cases keep it
 * held, so code that wrongly gets past the prepared check meets a port in use and fails quickly
 * instead of starting anything of its own.
 */
function holdThePort(port: number): Promise<{ close: () => Promise<void> }> {
  return new Promise((done, fail) => {
    const held = createHttpServer((_req, res) => {
      res.setHeader('content-type', 'application/json')
      res.end('{}')
    })
    held.on('error', fail)
    held.listen(port, '127.0.0.1', () => {
      done({
        close: () =>
          new Promise((closed) => {
            held.close(() => closed())
          }),
      })
    })
  })
}

/** Run one Git command in a scratch checkout and give back its status and what it said. */
function git(root: string, args: string[]): { ok: boolean; out: string } {
  const ran = spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], {
    cwd: root,
    encoding: 'utf8',
  })
  const out = `${ran.stdout ?? ''}${ran.stderr ?? ''}`.trim()
  return { ok: ran.status === 0, out }
}

/** The scratch checkout's HEAD, which its stamp must name. */
function theHead(root: string): string {
  return git(root, ['rev-parse', 'HEAD']).out
}

/**
 * A stand-in for `src/server/index.ts`: it holds a listener the way the real server does, records
 * the start in `.starts`, and exits when the process that started it is gone. It is a fixture and
 * it is written only into the scratch checkout.
 */
function theStandInServer(): string {
  return `
import { appendFileSync } from 'node:fs'
import { createServer } from 'node:http'
const alive = setInterval(() => {}, 1000)
const named = process.argv.find((one) => one.startsWith('--stop-with-pid='))
if (named !== undefined) {
  const starter = Number(named.slice('--stop-with-pid='.length))
  setInterval(() => {
    try {
      process.kill(starter, 0)
    } catch {
      process.exit(0)
    }
  }, 250).unref()
}
const server = createServer((_req, res) => {
  res.setHeader('content-type', 'application/json')
  res.end('{}')
})
const where = process.env.MOLE_OFFICE_LISTEN_FD ? { fd: Number(process.env.MOLE_OFFICE_LISTEN_FD) } : { port: 0, host: '127.0.0.1' }
server.listen(where, () => {
  appendFileSync('.starts', String(process.pid) + '\\n')
  console.log('stand-in ready')
})
process.on('SIGTERM', () => {
  server.close(() => {
    clearInterval(alive)
    process.exit(0)
  })
  server.closeAllConnections()
})
`
}

/** A scratch checkout with the parts the page's import graph and the supervisor need. */
function aScratchCheckout(withGit = true): string {
  const root = mkdtempSync(join(tmpdir(), 'prepared-start-'))
  for (const part of ['src', THE_PUBLIC_FOLDER, 'package.json', 'tsconfig.json']) {
    cpSync(join(REPO, part), join(root, part), { recursive: true })
  }
  symlinkSync(join(REPO, 'node_modules'), join(root, 'node_modules'))
  writeFileSync(join(root, 'src/server/index.ts'), theStandInServer())
  if (withGit) {
    const started = git(root, ['init', '-q'])
    const added = git(root, ['add', '-A'])
    const committed = git(root, ['commit', '-qm', 'the scratch checkout'])
    if (!started.ok || !added.ok || !committed.ok) {
      throw new Error(`the scratch checkout could not be made: ${committed.out}`)
    }
  }
  return root
}

/** Write a built page and a stamp naming `commit`, the way a real build leaves them. */
function putTheStamp(root: string, commit: string | null): void {
  const web = join(root, 'dist', 'web')
  mkdirSync(web, { recursive: true })
  writeFileSync(join(web, 'index.html'), '<!doctype html><html><body>prepared by a test</body></html>\n')
  writeFileSync(
    join(web, THE_BUILD_STAMP_FILE),
    `${JSON.stringify({ builtAt: '2026-10-17 06:00:00', builtAtMs: 1_760_700_000_000, commit }, null, 2)}\n`,
  )
}

/** The options every start in this file uses: no ledger, no saying, the chosen flags and builder. */
function optionsFor(
  root: string,
  built: boolean,
  prepared: boolean,
  buildThePage: ServeOptions['buildThePage'],
): ServeOptions {
  return { root, say: () => {}, writeItDown: false, built, prepared, buildThePage } as ServeOptions
}

/** A builder that counts its calls and leaves a built page behind, so a start can go on. */
function aBuildThatCounts(seen: CountingBuild): ServeOptions['buildThePage'] {
  return async (options = {}) => {
    seen.calls += 1
    const root = options.root ?? ''
    seen.roots.push(root)
    mkdirSync(join(root, 'dist', 'web'), { recursive: true })
    writeFileSync(join(root, 'dist', 'web', 'index.html'), '<!doctype html><html><body>built by a test</body></html>\n')
    return {
      ok: true,
      file: join(root, 'dist', 'web'),
      builtAt: '2026-10-17 06:00:00',
      newestSourceFile: null,
    }
  }
}

/** What a start said when it refused, or a sentence saying it did not. */
async function theRefusal(run: () => Promise<unknown>): Promise<string> {
  try {
    await run()
    return 'THE START WAS NOT REFUSED'
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

/** Wait until `test` is happy, or say what was waited for. */
async function until(test: () => boolean, what: string, within = 30_000): Promise<void> {
  const stop = Date.now() + within
  while (Date.now() < stop) {
    if (test()) return
    await sleep(100)
  }
  throw new Error(`${what} did not happen within ${String(within / 1000)}s.`)
}

/** Stub the two ports and the slow clock, as the other supervisor tests do. */
async function stubThePorts(): Promise<void> {
  vi.stubEnv('MOLE_OFFICE_PORT', String(await freePort()))
  vi.stubEnv('MOLE_OFFICE_WEB_PORT', String(await freePort()))
  vi.stubEnv('MOLE_OFFICE_CHECK_FOR_MISSED_CHANGES', '0')
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('the prepared supervisor start', () => {
  it('keeps plain --built building the page before the first start', async () => {
    const root = aScratchCheckout()
    const seen: CountingBuild = { calls: 0, roots: [] }
    await stubThePorts()
    let owner: Awaited<ReturnType<typeof serveDev>> | null = null
    try {
      owner = await serveDev(optionsFor(root, true, false, aBuildThatCounts(seen)))
      await until(() => existsSync(join(root, '.starts')), 'the stand-in server to start')
      expect(seen.calls).toBe(1)
      expect(seen.roots[0]).toBe(root)
    } finally {
      await owner?.stop()
      rmSync(root, { recursive: true, force: true })
    }
  }, 120_000)

  it('refuses --prepared without --built in one sentence, before anything listens', async () => {
    const root = aScratchCheckout()
    const seen: CountingBuild = { calls: 0, roots: [] }
    const port = await freePort()
    const held = await holdThePort(port)
    vi.stubEnv('MOLE_OFFICE_PORT', String(port))
    vi.stubEnv('MOLE_OFFICE_WEB_PORT', String(await freePort()))
    try {
      const refusal = await theRefusal(() => serveDev(optionsFor(root, false, true, aBuildThatCounts(seen))))
      expect(refusal).toBe('--prepared requires --built.')
      expect(seen.calls).toBe(0)
      expect(existsSync(join(root, '.starts'))).toBe(false)
    } finally {
      await held.close()
      rmSync(root, { recursive: true, force: true })
    }
  }, 60_000)

  it('refuses a prepared start with missing or unreadable artifacts, before anything listens', async () => {
    const root = aScratchCheckout()
    const seen: CountingBuild = { calls: 0, roots: [] }
    const port = await freePort()
    const held = await holdThePort(port)
    vi.stubEnv('MOLE_OFFICE_PORT', String(port))
    vi.stubEnv('MOLE_OFFICE_WEB_PORT', String(await freePort()))
    const start = (): Promise<unknown> => serveDev(optionsFor(root, true, true, aBuildThatCounts(seen)))
    try {
      expect(await theRefusal(start)).toContain('dist/web/index.html is not there')
      mkdirSync(join(root, 'dist', 'web'), { recursive: true })
      writeFileSync(join(root, 'dist', 'web', 'index.html'), '<!doctype html><html><body>no stamp yet</body></html>\n')
      expect(await theRefusal(start)).toContain('there is no build stamp')
      writeFileSync(join(root, 'dist', 'web', THE_BUILD_STAMP_FILE), 'this is not a stamp\n')
      expect(await theRefusal(start)).toContain('the build stamp cannot be read')
      writeFileSync(
        join(root, 'dist', 'web', THE_BUILD_STAMP_FILE),
        `${JSON.stringify({ builtAt: '2026-10-17 06:00:00', builtAtMs: 1_760_700_000_000, commit: null })}\n`,
      )
      expect(await theRefusal(start)).toContain('the build stamp names no commit')
      expect(seen.calls).toBe(0)
      expect(existsSync(join(root, '.starts'))).toBe(false)
    } finally {
      await held.close()
      rmSync(root, { recursive: true, force: true })
    }
  }, 60_000)

  it('refuses a prepared start whose stamp is not this checkout, before anything listens', async () => {
    const root = aScratchCheckout()
    const first = theHead(root)
    appendFileSync(join(root, 'package.json'), '\n')
    git(root, ['add', '-A'])
    git(root, ['commit', '-qm', 'the second commit'])
    const second = theHead(root)
    expect(second).not.toBe(first)
    const seen: CountingBuild = { calls: 0, roots: [] }
    const port = await freePort()
    const held = await holdThePort(port)
    vi.stubEnv('MOLE_OFFICE_PORT', String(port))
    vi.stubEnv('MOLE_OFFICE_WEB_PORT', String(await freePort()))
    const start = (): Promise<unknown> => serveDev(optionsFor(root, true, true, aBuildThatCounts(seen)))
    try {
      putTheStamp(root, first)
      const stale = await theRefusal(start)
      expect(stale).toContain(`names commit ${first}`)
      expect(stale).toContain(`at ${second}`)
      putTheStamp(root, 'f'.repeat(40))
      expect(await theRefusal(start)).toContain(`could not read commit ${'f'.repeat(40)}`)
      expect(seen.calls).toBe(0)
      expect(existsSync(join(root, '.starts'))).toBe(false)
    } finally {
      await held.close()
      rmSync(root, { recursive: true, force: true })
    }
  }, 60_000)

  it('refuses a prepared start where Git cannot read the checkout, with no fallback', async () => {
    const root = aScratchCheckout(false)
    putTheStamp(root, 'a'.repeat(40))
    const seen: CountingBuild = { calls: 0, roots: [] }
    const port = await freePort()
    const held = await holdThePort(port)
    vi.stubEnv('MOLE_OFFICE_PORT', String(port))
    vi.stubEnv('MOLE_OFFICE_WEB_PORT', String(await freePort()))
    try {
      const refusal = await theRefusal(() => serveDev(optionsFor(root, true, true, aBuildThatCounts(seen))))
      expect(refusal).toContain('could not name the top level of this checkout')
      expect(seen.calls).toBe(0)
      expect(existsSync(join(root, '.starts'))).toBe(false)
    } finally {
      await held.close()
      rmSync(root, { recursive: true, force: true })
    }
  }, 60_000)

  it('reads this checkout even when the Git environment points at another repository', async () => {
    const root = aScratchCheckout()
    putTheStamp(root, theHead(root))
    const elsewhere = aScratchCheckout()
    appendFileSync(join(elsewhere, 'package.json'), '\n')
    git(elsewhere, ['add', '-A'])
    git(elsewhere, ['commit', '-qm', 'the other repository'])
    expect(theHead(elsewhere)).not.toBe(theHead(root))
    const seen: CountingBuild = { calls: 0, roots: [] }
    await stubThePorts()
    vi.stubEnv('GIT_DIR', join(elsewhere, '.git'))
    vi.stubEnv('GIT_WORK_TREE', elsewhere)
    let owner: Awaited<ReturnType<typeof serveDev>> | null = null
    try {
      owner = await serveDev(optionsFor(root, true, true, aBuildThatCounts(seen)))
      await until(() => existsSync(join(root, '.starts')), 'the stand-in server to start')
      expect(seen.calls).toBe(0)
    } finally {
      await owner?.stop()
      vi.unstubAllEnvs()
      rmSync(root, { recursive: true, force: true })
      rmSync(elsewhere, { recursive: true, force: true })
    }
    // A root that is not the top level of its own repository is refused by name.
    const outer = aScratchCheckout()
    const inner = join(outer, 'inner')
    mkdirSync(inner, { recursive: true })
    putTheStamp(inner, theHead(outer))
    const refused: CountingBuild = { calls: 0, roots: [] }
    const port = await freePort()
    const held = await holdThePort(port)
    vi.stubEnv('MOLE_OFFICE_PORT', String(port))
    vi.stubEnv('MOLE_OFFICE_WEB_PORT', String(await freePort()))
    try {
      const refusal = await theRefusal(() => serveDev(optionsFor(inner, true, true, aBuildThatCounts(refused))))
      expect(refusal).toContain('top level')
      expect(refusal).toContain(outer)
      expect(refused.calls).toBe(0)
      expect(existsSync(join(inner, '.starts'))).toBe(false)
    } finally {
      await held.close()
      vi.unstubAllEnvs()
      rmSync(outer, { recursive: true, force: true })
    }
  }, 120_000)

  it('runs the prepared check\u2019s Git with literal path handling set', async () => {
    const root = aScratchCheckout()
    putTheStamp(root, theHead(root))
    const shim = mkdtempSync(join(tmpdir(), 'git-shim-'))
    const record = join(shim, 'the-git-environment.txt')
    const gitShim = join(shim, 'git')
    writeFileSync(gitShim, `#!/bin/sh\nenv > ${JSON.stringify(record)}\nexec /usr/bin/git "$@"\n`)
    chmodSync(gitShim, 0o755)
    const seen: CountingBuild = { calls: 0, roots: [] }
    await stubThePorts()
    vi.stubEnv('PATH', `${shim}:${process.env.PATH ?? ''}`)
    let owner: Awaited<ReturnType<typeof serveDev>> | null = null
    try {
      owner = await serveDev(optionsFor(root, true, true, aBuildThatCounts(seen)))
      await until(() => existsSync(join(root, '.starts')), 'the stand-in server to start')
      expect(seen.calls).toBe(0)
      const recorded = readFileSync(record, 'utf8')
      expect(recorded).toContain('GIT_LITERAL_PATHSPECS=1')
      expect(recorded).toContain('GIT_NO_REPLACE_OBJECTS=1')
      expect(recorded).toContain('HOME=/nonexistent')
    } finally {
      await owner?.stop()
      vi.unstubAllEnvs()
      rmSync(root, { recursive: true, force: true })
      rmSync(shim, { recursive: true, force: true })
    }
  }, 120_000)

  it('refuses a prepared start with uncommitted changes in the files the page is built from', async () => {
    const root = aScratchCheckout()
    putTheStamp(root, theHead(root))
    appendFileSync(join(root, 'src/web/App.tsx'), '\n// a change nobody committed\n')
    const seen: CountingBuild = { calls: 0, roots: [] }
    const port = await freePort()
    const held = await holdThePort(port)
    vi.stubEnv('MOLE_OFFICE_PORT', String(port))
    vi.stubEnv('MOLE_OFFICE_WEB_PORT', String(await freePort()))
    try {
      const refusal = await theRefusal(() => serveDev(optionsFor(root, true, true, aBuildThatCounts(seen))))
      expect(refusal).toContain('src/web/App.tsx')
      expect(refusal).toContain('not clean in git')
      expect(seen.calls).toBe(0)
      expect(existsSync(join(root, '.starts'))).toBe(false)
    } finally {
      await held.close()
      rmSync(root, { recursive: true, force: true })
    }
  }, 60_000)
})

describe('a prepared start with a matching build', () => {
  let root = ''
  let owner: Awaited<ReturnType<typeof serveDev>> | null = null
  const seen: CountingBuild = { calls: 0, roots: [] }

  beforeAll(async () => {
    root = aScratchCheckout()
    putTheStamp(root, theHead(root))
    await stubThePorts()
    owner = await serveDev(optionsFor(root, true, true, aBuildThatCounts(seen)))
    await until(() => existsSync(join(root, '.starts')), 'the stand-in server to start')
  }, 120_000)

  afterAll(async () => {
    await owner?.stop()
    if (root !== '') rmSync(root, { recursive: true, force: true })
  })

  it('skips the build before the first start', () => {
    expect(seen.calls).toBe(0)
  })

  it('still rebuilds after a page file changes', async () => {
    const before = seen.calls
    const when = new Date()
    utimesSync(join(root, 'src/web/App.tsx'), when, when)
    await until(() => seen.calls > before, 'the page rebuild to run', 60_000)
    expect(seen.calls).toBe(before + 1)
    expect(seen.roots.at(-1)).toBe(root)
  }, 90_000)
})
