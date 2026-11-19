// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A COPY OF THE STABLE OFFICE IS MADE THROUGH THE STABLE CHECKOUT'S OWN TOOL, PAIRED WITH THE DEVELOPMENT CHECKOUT.
 *
 * A development checkout whose .env names MOLE_OFFICE_STABLE_CHECKOUT may not open that database, so
 * tools/office-copy.mjs refuses there. This file drives the way round it: tools/office-copy-through-the-stable-checkout.mjs
 * runs the stable checkout's own tools/office-copy.mjs with the same arguments, paired with the development checkout.
 * Since wave 13q it does that by calling the command form, tools/through-the-stable-checkout.mjs, which says so on its
 * first line.
 *
 * The fixture is two throwaway checkouts, as tests/the-stable-office-database-guard.test.ts makes them: the
 * development one holds a .env that names a relative database and the stable one, and the stable one holds no
 * .env of its own. A migrated database made by freshDb is placed at the path the relative setting names. Every
 * child runs with HOME under this test's folder and with every MOLE_* and VITEST* variable deleted, so no use
 * line goes to any office. No server is started; the chosen port only keeps the fixture's settings away from a
 * real office.
 *
 * What it measures, each by running a command:
 *   - the development checkout's own tool refuses its make with the pairing refusal and names the wrapper, its
 *     help names the wrapper too, and the wrapper's --help is office-copy's own help, run in the stable checkout;
 *   - the wrapper makes and opens the copy through the stable checkout, the make line names the development
 *     checkout's database, the stable fixture holds neither that database nor a .env, and the unpacked copy
 *     holds the run's record and the marker row naming the run;
 *   - the wrapper makes a copy from a worktree of the development checkout that has no .env of its own;
 *   - the wrapper refuses MOLE_OFFICE_DB in its environment, and writes nothing, the log included;
 *   - the wrapper refuses a .env that names no stable checkout, and names tools/office-copy.mjs;
 *   - the wrapper refuses a process already paired with a development checkout;
 *   - sweep passes through the wrapper and keeps the copy of a run still going.
 */

import Database from 'better-sqlite3'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { writeInstance } from '../tools/sandbox-common.mjs'
import { freshDb, type TestDb } from './helpers.ts'

const SOURCE = fileURLToPath(new URL('..', import.meta.url))

/** What each throwaway checkout is a copy of, as in the guard test. */
const COPIED = ['src', 'scripts', 'tools', 'for-agents', 'held-migrations', 'drizzle', 'package.json', 'tsconfig.json']

/** The row of a copy's runtime_settings table in which it names its run. */
const MARKER = 'office-copy.marker'

/** The database's path, as the development .env names it: relative, so the root that reads it is proved. */
const RELATIVE_DATABASE = 'data/office.sqlite'

/** The sandboxes this file gives the tool, each with an out folder of its own. */
const SANDBOX_NAMES = ['direct', 'sb', 'worktree', 'env-refused', 'no-pairing', 'sweep']

let root: string
let dev: string
let stable: string
let worktree: string
let database: string
let sandboxes: string
let source: TestDb
let port: number
let firstRun: string
let secondRun: string
let thirdRun: string

interface Ran {
  status: number
  stdout: string
  stderr: string
}

/** The environment every child gets: a home under this test's folder, and none of the office's variables. */
function childEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: join(root, 'home') }
  for (const key of Object.keys(env)) if (key.startsWith('MOLE_') || key.startsWith('VITEST')) delete env[key]
  return { ...env, ...extra }
}

function run(cwd: string, tool: string, args: readonly string[], extra: Record<string, string> = {}): Ran {
  const found = spawnSync(process.execPath, [tool, ...args], {
    cwd,
    encoding: 'utf8',
    env: childEnv(extra),
    timeout: 180_000,
  })
  return { status: found.status ?? -1, stdout: found.stdout ?? '', stderr: found.stderr ?? '' }
}

const devTool = (): string => join(dev, 'tools', 'office-copy.mjs')
const wrapperIn = (checkout: string): string => join(checkout, 'tools', 'office-copy-through-the-stable-checkout.mjs')
const outOf = (name: string): string => join(sandboxes, name, 'out')
/** The first line the command form writes when it runs the stable checkout's office-copy for the development checkout. */
const theCommandFormsLine = (): string =>
  `through-the-stable-checkout: running tools/office-copy.mjs from the stable checkout ${stable}, paired with the development checkout ${dev}. It reads the database that ${join(dev, '.env')} names, as the stable office does.`

/** A folder that looks to the tool like a sandbox: its facts, both copies as up writes them, and an out folder. */
function aSandbox(name: string): string {
  const dir = join(sandboxes, name)
  mkdirSync(dir, { recursive: true })
  writeInstance(dir, { instance: 'made by a test' })
  mkdirSync(join(dir, 'out'))
  return join(dir, 'out')
}

/** A run in the database, still going, so no sweep removes its copy. */
function aRun(title: string): string {
  return source.api.createRecord({
    kind: 'session',
    title,
    workspaceId: 'default',
    actor: { type: 'agent', id: 'copy-tester' },
    origin: 'fixture',
    data: { state: 'running' },
  }).id
}

/** The development .env: a port of this test's own, the relative database, and the stable checkout. */
function theDevelopmentEnv(): string {
  return `MOLE_OFFICE_PORT=${String(port)}\nMOLE_OFFICE_DB=${RELATIVE_DATABASE}\nMOLE_OFFICE_STABLE_CHECKOUT=${stable}\n`
}

/** A free port, so the fixture's settings name no office that could be serving. */
async function aFreePort(): Promise<number> {
  return await new Promise((resolvePort, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      const chosen = typeof address === 'object' && address !== null ? address.port : 0
      probe.close(() => resolvePort(chosen))
    })
  })
}

/** Read one value out of a database, read-only. */
function valueIn(file: string, sql: string, ...parameters: unknown[]): unknown {
  const db = new Database(file, { readonly: true, fileMustExist: true })
  try {
    return db.prepare(sql).get(...parameters)
  } finally {
    db.close()
  }
}

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'stable-copy-through-wrapper-'))
  mkdirSync(join(root, 'home'))
  dev = join(root, 'development')
  stable = join(root, 'stable')
  for (const checkout of [dev, stable]) {
    mkdirSync(checkout)
    for (const name of COPIED) cpSync(join(SOURCE, name), join(checkout, name), { recursive: true })
    symlinkSync(join(SOURCE, 'node_modules'), join(checkout, 'node_modules'))
    expect(spawnSync('git', ['init', '--quiet', checkout]).status).toBe(0)
  }

  // ONE MIGRATED DATABASE, WITH THREE RUNS STILL GOING, at the path the relative setting names.
  source = await freshDb()
  firstRun = aRun('A made-up first run the copy is for')
  secondRun = aRun('A made-up second run, copied from a worktree')
  thirdRun = aRun('A made-up third run still going at the sweep')
  database = join(dev, 'data', 'office.sqlite')
  mkdirSync(join(dev, 'data'), { recursive: true })
  await source.client.sqlite.backup(database)
  source.close()

  port = await aFreePort()
  writeFileSync(join(dev, '.env'), theDevelopmentEnv())

  sandboxes = join(root, 'sandboxes')
  for (const name of SANDBOX_NAMES) aSandbox(name)

  // A WORKTREE OF THE DEVELOPMENT CHECKOUT, whose only .env is the main checkout's, found through .git.
  const staged = spawnSync(
    'git',
    ['-C', dev, 'add', 'src', 'scripts', 'tools', 'for-agents', 'held-migrations', 'drizzle', 'package.json', 'tsconfig.json', 'node_modules'],
    { encoding: 'utf8' },
  )
  expect(staged.status, staged.stderr).toBe(0)
  const committed = spawnSync(
    'git',
    ['-C', dev, '-c', 'user.name=A made-up test', '-c', 'user.email=test@example.invalid', 'commit', '--quiet', '-m', 'A made-up fixture for the copy wrapper'],
    { encoding: 'utf8' },
  )
  expect(committed.status, committed.stderr).toBe(0)
  worktree = join(root, 'worktree')
  const added = spawnSync('git', ['-C', dev, 'worktree', 'add', '--quiet', worktree, 'HEAD'], { encoding: 'utf8' })
  expect(added.status, added.stderr).toBe(0)
  expect(existsSync(join(worktree, '.env')), 'the worktree has an .env of its own, so this proves nothing').toBe(false)
}, 180_000)

afterAll(() => {
  if (root !== undefined) rmSync(root, { recursive: true, force: true })
})

describe('the development checkout names the way', () => {
  it("refuses its own make, names the wrapper in the refusal and in its help, and the wrapper's --help is the stable checkout's help", () => {
    const refused = run(dev, devTool(), ['make', '--to', 'direct', '--for', firstRun, '--sandboxes', sandboxes])
    expect(refused.status, refused.stderr).toBe(1)
    expect(refused.stderr).toContain('MOLE_OFFICE_STABLE_CHECKOUT')
    expect(refused.stderr).toContain(stable)
    expect(refused.stderr).toContain('node tools/office-copy-through-the-stable-checkout.mjs')
    expect(readdirSync(outOf('direct')), 'the refused make left a file in the sandbox').toEqual([])

    const help = run(dev, devTool(), ['--help'])
    expect(help.status, help.stderr).toBe(0)
    expect(help.stdout).toContain('node tools/office-copy-through-the-stable-checkout.mjs')

    const wrapperHelp = run(dev, wrapperIn(dev), ['--help'])
    expect(wrapperHelp.status, wrapperHelp.stderr).toBe(0)
    expect(wrapperHelp.stdout).toContain('node tools/office-copy-through-the-stable-checkout.mjs')
    expect(wrapperHelp.stderr.split('\n')[0]).toBe(theCommandFormsLine())
  })
})

describe('the wrapper makes and opens the copy', () => {
  it('reads the relative database against the development checkout, and the stable checkout holds none', () => {
    const made = run(dev, wrapperIn(dev), ['make', '--to', 'sb', '--for', firstRun, '--sandboxes', sandboxes])
    expect(made.status, made.stderr).toBe(0)
    expect(made.stdout).toContain(`make: copied ${database}`)
    expect(made.stderr.split('\n')[0]).toBe(theCommandFormsLine())
    expect(existsSync(join(outOf('sb'), `office-copy-${firstRun}.db.gz`))).toBe(true)
    expect(existsSync(join(stable, 'data', 'office.sqlite')), 'the stable fixture holds a database the tool could have read').toBe(false)
    expect(existsSync(join(stable, '.env')), 'the stable fixture has an .env of its own').toBe(false)

    const opened = run(dev, wrapperIn(dev), ['open', '--in', 'sb', '--for', firstRun, '--sandboxes', sandboxes])
    expect(opened.status, opened.stderr).toBe(0)
    const unpacked = join(outOf('sb'), `office-copy-${firstRun}.db`)
    expect(existsSync(unpacked)).toBe(true)
    expect(valueIn(unpacked, 'SELECT kind FROM records WHERE id = ?', firstRun)).toEqual({ kind: 'session' })
    const marker = valueIn(unpacked, 'SELECT value FROM runtime_settings WHERE name = ?', MARKER) as { value: string } | undefined
    expect(marker, 'the copy holds no marker row').toBeDefined()
    expect(JSON.parse(marker!.value)).toMatchObject({ madeBy: 'tools/office-copy.mjs', forRun: firstRun })
  })

  it('makes a copy from a worktree of the development checkout that has no .env of its own', () => {
    const made = run(worktree, wrapperIn(worktree), ['make', '--to', 'worktree', '--for', secondRun, '--sandboxes', sandboxes])
    expect(made.status, made.stderr).toBe(0)
    expect(made.stdout).toContain(`make: copied ${database}`)
    expect(existsSync(join(outOf('worktree'), `office-copy-${secondRun}.db.gz`))).toBe(true)
  })
})

describe('the wrapper refuses what it cannot pair', () => {
  it('refuses MOLE_OFFICE_DB in its environment, and runs nothing', () => {
    const refused = run(dev, wrapperIn(dev), ['make', '--to', 'env-refused', '--for', firstRun, '--sandboxes', sandboxes], {
      MOLE_OFFICE_DB: join(root, 'another.sqlite'),
    })
    expect(refused.status, refused.stderr).toBe(2)
    expect(refused.stderr).toContain('MOLE_OFFICE_DB')
    expect(refused.stderr).toContain('Nothing was run.')
    expect(readdirSync(outOf('env-refused')), 'the refused wrapper wrote a file, the log included').toEqual([])
  })

  it('refuses a .env that names no stable checkout, and names tools/office-copy.mjs', () => {
    writeFileSync(join(dev, '.env'), `MOLE_OFFICE_PORT=${String(port)}\nMOLE_OFFICE_DB=${RELATIVE_DATABASE}\n`)
    try {
      const refused = run(dev, wrapperIn(dev), ['sweep', '--sandboxes', sandboxes])
      expect(refused.status, refused.stderr).toBe(2)
      expect(refused.stderr).toContain(join(dev, '.env'))
      expect(refused.stderr).toContain('tools/office-copy.mjs')
      expect(refused.stderr).toContain('Nothing was run.')
    } finally {
      writeFileSync(join(dev, '.env'), theDevelopmentEnv())
    }
  })

  it('refuses a process that is already paired with a development checkout', () => {
    const refused = run(stable, wrapperIn(stable), ['sweep', '--sandboxes', sandboxes], { MOLE_OFFICE_DEVELOPMENT_CHECKOUT: dev })
    expect(refused.status, refused.stderr).toBe(2)
    expect(refused.stderr).toContain('MOLE_OFFICE_DEVELOPMENT_CHECKOUT')
    expect(refused.stderr).toContain('Nothing was run.')
  })
})

describe('the wrapper passes sweep through', () => {
  it('keeps the copy of a run still going', () => {
    const made = run(dev, wrapperIn(dev), ['make', '--to', 'sweep', '--for', thirdRun, '--sandboxes', sandboxes])
    expect(made.status, made.stderr).toBe(0)
    const swept = run(dev, wrapperIn(dev), ['sweep', '--sandboxes', sandboxes])
    expect(swept.status, swept.stderr).toBe(0)
    expect(existsSync(join(outOf('sweep'), `office-copy-${thirdRun}.db.gz`))).toBe(true)
    expect(swept.stdout).toContain('and removed 0, whose run had ended or could not be read.')
  })
})
