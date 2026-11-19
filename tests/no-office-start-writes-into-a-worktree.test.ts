// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * NO OFFICE START WRITES ITS DATA INTO A GIT WORKTREE (problem nd7jOk5LCU4s).
 *
 * 328 files `data/keys.json` were found in worktrees under the sandboxes, made between 22 September
 * and 5 October 2026 by offices started there on the checkout's own `data/`: the dev server
 * (tools/serve-dev.mjs), and a test whose server opened a database in the checkout. The session
 * hook in such a checkout reads that file as its office's key.
 *
 * So the start refuses, in words that begin `REFUSING TO `, before it writes anything, when its data
 * folder is inside a worktree: the database's opener and the key file's maker both ask
 * src/server/lib/git-checkout.ts. A main clone, where the owner's office runs, is never refused.
 *
 * The worktree here is a real one, made by git in a temporary folder, so the test reads what git
 * wrote rather than a layout written to look like it.
 */
import { apiServerArguments } from './helpers.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, realpathSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { THE_GUARD_REFUSALS_BEGIN } from '../src/config/guard-refusal.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const TSX = join(ROOT, 'node_modules/.bin/tsx')

let scratch = ''
let clone = ''
let worktree = ''

function git(args: string[], cwd: string): void {
  execFileSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.invalid', ...args], { cwd, stdio: 'ignore' })
}

beforeAll(() => {
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-a-worktree-'))
  clone = join(scratch, 'clone')
  worktree = join(scratch, 'worktree')
  git(['init', '-q', clone], scratch)
  git(['commit', '-q', '--allow-empty', '-m', 'empty'], clone)
  git(['worktree', 'add', '-q', '--detach', worktree], clone)
  worktree = realpathSync(worktree)
  clone = realpathSync(clone)
})

afterAll(() => {
  if (scratch !== '') rmSync(scratch, { recursive: true, force: true })
})

/** The environment of a start outside this test runner, naming `database` and no office. */
function anEnvironment(database: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, MOLE_OFFICE_DB: database, MOLE_OFFICE_MESSAGE_WORKER: 'off', LOG_LEVEL: 'warn' }
  for (const name of ['VITEST', 'VITEST_WORKER_ID', 'MOLE_OFFICE_API', 'MOLE_OFFICE_SESSION', 'MOLE_OFFICE_AGENT', 'MOLE_AGENT_KEY']) {
    delete env[name]
  }
  return env
}

/**
 * Run a command in its own process group and hand back how it ended and what it said. A start that
 * is not refused does not end, so after `ms` its group is stopped and `ended` says so.
 */
function run(args: string[], env: NodeJS.ProcessEnv, ms: number): Promise<{ ended: string; said: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(TSX, args, { cwd: ROOT, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let said = ''
    child.stdout.on('data', (chunk: Buffer) => { said += chunk.toString('utf8') })
    child.stderr.on('data', (chunk: Buffer) => { said += chunk.toString('utf8') })
    const stop = setTimeout(() => {
      if (child.pid !== undefined) process.kill(-child.pid, 'SIGTERM')
    }, ms)
    child.on('error', reject)
    child.on('close', (code, signal) => {
      clearTimeout(stop)
      resolve({ ended: signal !== null ? `stopped after ${String(ms)} ms by ${signal}` : `exit ${String(code)}`, said })
    })
  })
}

/** A port nothing listens on now, for a start that is not refused. */
function aFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.on('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      const port = address !== null && typeof address !== 'string' ? address.port : 0
      probe.close(() => { resolve(port) })
    })
  })
}

const MAKE_THE_KEYS = (): string[] => [
  '-e',
  `import('${join(ROOT, 'src/server/lib/keys.ts')}').then((m) => { m.ensureKeysExist(); console.log('made') })`,
]

describe('an office started on a data folder inside a git worktree', () => {
  it('refuses in words before it writes anything: the server', async () => {
    const data = join(worktree, 'data')
    const env = { ...anEnvironment(join(data, 'mole-office.db')), MOLE_OFFICE_PORT: String(await aFreePort()) }
    const { ended, said } = await run(apiServerArguments(), env, 60_000)
    expect(ended, said).toBe('exit 1')
    expect(said).toContain(`${THE_GUARD_REFUSALS_BEGIN}WRITE ${join(data, 'mole-office.db')}`)
    expect(said).toContain(`inside the git worktree ${worktree}`)
    expect(existsSync(data) ? readdirSync(data) : [], said).toEqual([])
  }, 90_000)

  it('refuses in words before it writes anything: a script that makes the keys', async () => {
    const data = join(worktree, 'keys-only')
    const { ended, said } = await run(MAKE_THE_KEYS(), anEnvironment(join(data, 'mole-office.db')), 60_000)
    expect(ended, said).not.toBe('exit 0')
    // keys.ts reaches the database's opener on import, so either door may be the one that refuses.
    expect(said).toContain(`${THE_GUARD_REFUSALS_BEGIN}WRITE ${data}/`)
    expect(existsSync(data) ? readdirSync(data) : [], said).toEqual([])
  }, 90_000)
})

describe('an office started on a data folder inside a main clone', () => {
  it('is not refused, because the owner\'s office runs from one', async () => {
    const data = join(clone, 'data')
    const { ended, said } = await run(MAKE_THE_KEYS(), anEnvironment(join(data, 'mole-office.db')), 60_000)
    expect(ended, said).toBe('exit 0')
    expect(existsSync(join(data, 'keys.json')), said).toBe(true)
  }, 90_000)
})
