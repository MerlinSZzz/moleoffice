// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE STABLE OFFICE'S START CHECKS ITS DATED TAG BEFORE ANYTHING OPENS THE DATABASE.
 *
 * src/config/stable-tag.mjs is the check, and tests/the-stable-office-starts-only-at-a-dated-tag.test.ts
 * proves it alone. This file proves where the server's start calls it. A stable office is one started
 * with MOLE_OFFICE_DEVELOPMENT_CHECKOUT, and only it is asked. The owner's sentence for this refusal
 * says "Your data was not touched" (5pMx2k6czcl_), and that is only true while the check runs
 * before the database is opened, the service lock is taken or a port is read.
 *
 * HOW. Two throwaway checkouts are copied from this one, as tests/the-stable-office-start.test.ts copies
 * them: a development checkout whose .env names the stable one, and the stable one. The real server is
 * started in the stable checkout. Its database is a path in an empty folder of its own. Opening it
 * would make the file, and taking the lock would make its .service.json beside it, so an empty folder
 * after the start is what "nothing was opened" looks like.
 *
 * MUTATIONS, each planted alone in src/server/index.ts with this whole file run:
 *   - delete the check: the first case goes red;
 *   - move the check below the service lock: the first case goes red, on the folder;
 *   - move the check below the release-check branch: the release-check case goes red;
 *   - drop the MOLE_OFFICE_DEVELOPMENT_CHECKOUT gate: the development-checkout case goes red.
 */

import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, expect, it } from 'vitest'

import { THE_STABLE_TAG_REFUSAL_BEGINS, THE_STABLE_TAG_REFUSAL_EXIT_CODE } from '../src/config/stable-tag.mjs'

const SOURCE = fileURLToPath(new URL('..', import.meta.url))
const GIT_ENVIRONMENT = {
  PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
  HOME: '/nowhere-called-home',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_TERMINAL_PROMPT: '0',
  LANG: 'C',
}
const DATED = 'stable-2026-10-19-the-tag-check'

let root = ''
let dev = ''
let stable = ''
let port = 0

function git(cwd: string, ...args: string[]): string {
  const ran = spawnSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.invalid', ...args], {
    cwd,
    env: GIT_ENVIRONMENT,
    encoding: 'utf8',
  })
  if (ran.status !== 0) throw new Error(`git ${args.join(' ')} failed in ${cwd}: ${ran.stderr}`)
  return ran.stdout.trim()
}

/** A port nothing listens on now. Only a planted mutation that lets the server go on would use it. */
async function aFreePort(): Promise<number> {
  return await new Promise((done, failed) => {
    const server = createServer()
    server.once('error', failed)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() => (address !== null && typeof address === 'object' ? done(address.port) : failed(new Error('no port'))))
    })
  })
}

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'stable-office-tag-before-database-'))
  dev = join(root, 'development')
  stable = join(root, 'stable')
  mkdirSync(dev)
  mkdirSync(stable)
  mkdirSync(join(root, 'home'))
  for (const checkout of [dev, stable]) {
    for (const name of ['src', 'tools', 'for-agents', 'package.json', 'tsconfig.json']) {
      cpSync(join(SOURCE, name), join(checkout, name), { recursive: true })
    }
    symlinkSync(join(SOURCE, 'node_modules'), join(checkout, 'node_modules'))
    git(checkout, 'init', '--quiet', '--initial-branch=stable')
  }
  // Stable's branch stable holds one commit, with a tag on it that is not a dated stable tag.
  git(stable, 'commit', '--quiet', '--allow-empty', '-m', 'the stable fixture')
  git(stable, 'tag', 'v1')
  port = await aFreePort()
}, 60_000)

afterAll(() => {
  if (root !== '') rmSync(root, { recursive: true, force: true })
})

/** Gives stable's one commit the dated tag, or takes it away. */
function datedTag(present: boolean): void {
  const there = git(stable, 'tag', '--list', DATED) === DATED
  if (present && !there) git(stable, 'tag', DATED)
  if (!present && there) git(stable, 'tag', '-d', DATED)
}

/**
 * Starts the real server in `stable` (paired) or `dev` (not paired). Its database is in a new empty
 * folder of its own, `data`, so one start cannot leave a file that another case then reads.
 */
function start(paired: boolean, mode = 'ordinary', ...args: string[]) {
  const data = mkdtempSync(join(root, 'data-'))
  writeFileSync(
    join(dev, '.env'),
    `MOLE_OFFICE_PORT=${String(port)}\nMOLE_OFFICE_DB=${join(data, 'office.db')}\n` +
      (paired ? `MOLE_OFFICE_STABLE_CHECKOUT=${stable}\n` : ''),
  )
  const env: Record<string, string | undefined> = { ...process.env, HOME: join(root, 'home') }
  for (const key of Object.keys(env)) if (key.startsWith('MOLE_') || key.startsWith('VITEST')) delete env[key]
  if (paired) env.MOLE_OFFICE_DEVELOPMENT_CHECKOUT = dev
  env.MOLE_OFFICE_START_MODE = mode
  // The owner flag comes last because the server reads the first `--stop-with-pid=` it is given, so a
  // case's own `--stop-with-pid=invalid` is still the one read.
  const read = spawnSync(process.execPath, ['--import', 'tsx', 'src/server/index.ts', ...args, `--stop-with-pid=${String(process.pid)}`], {
    cwd: paired ? stable : dev,
    env,
    encoding: 'utf8',
    timeout: 30_000,
  })
  return { read, data }
}

it('refuses a stable checkout at no dated tag with exit 78, and opens nothing in the database folder', () => {
  datedTag(false)

  const { read, data } = start(true)

  expect(read.status, read.stderr).toBe(THE_STABLE_TAG_REFUSAL_EXIT_CODE)
  expect(read.stderr).toContain(THE_STABLE_TAG_REFUSAL_BEGINS)
  expect(read.stderr).toContain('v1')
  expect(readdirSync(data), 'no database, -wal, -shm, service lock or key was made').toEqual([])
})

it('lets a stable checkout at a dated tag go on to the next start step', () => {
  datedTag(true)

  // The invalid option is read after the check and before anything is opened, so the start stops there.
  const { read, data } = start(true, 'ordinary', '--stop-with-pid=invalid')

  expect(read.status).not.toBe(THE_STABLE_TAG_REFUSAL_EXIT_CODE)
  expect(read.stderr).not.toContain(THE_STABLE_TAG_REFUSAL_BEGINS)
  expect(read.stderr).toContain('stop-with-pid')
  expect(readdirSync(data)).toEqual([])
})

it('checks the tag before the release-check branch', () => {
  datedTag(false)

  const { read, data } = start(true, 'release-check')

  expect(read.status, read.stderr).toBe(THE_STABLE_TAG_REFUSAL_EXIT_CODE)
  expect(read.stderr).toContain(THE_STABLE_TAG_REFUSAL_BEGINS)
  expect(readdirSync(data)).toEqual([])
})

it('does not ask a server started from the development checkout', () => {
  // The development checkout is on a branch stable with no commit and no tag, which the check would refuse.
  const { read, data } = start(false, 'ordinary', '--stop-with-pid=invalid')

  expect(read.status).not.toBe(THE_STABLE_TAG_REFUSAL_EXIT_CODE)
  expect(read.stderr).not.toContain(THE_STABLE_TAG_REFUSAL_BEGINS)
  expect(read.stderr).toContain('stop-with-pid')
  expect(readdirSync(data)).toEqual([])
})
