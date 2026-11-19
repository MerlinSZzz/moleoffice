// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Settings must establish the named real checkout before any database opener can run. */
import { spawn, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import { serviceLockPathFrom } from '../src/config/settings.mjs'
import { takeTheServiceLock, theProcessReading } from '../src/config/the-service-lock.mjs'

const source = fileURLToPath(new URL('..', import.meta.url))
const copied = ['src', 'scripts', 'tools', 'for-agents', 'held-migrations', 'drizzle', 'package.json', 'tsconfig.json']
let root: string, dev: string, stable: string, third: string, worktree: string, database: string, home: string, port: number, spawnRequests: string

function environment(pair = false): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: home, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' }
  for (const key of Object.keys(env)) if (key.startsWith('MOLE_') || key.startsWith('VITEST')) delete env[key]
  if (pair) env.MOLE_OFFICE_DEVELOPMENT_CHECKOUT = dev
  return env
}

function git(cwd: string, ...args: string[]) {
  const result = spawnSync('git', ['-c', 'user.name=Synthetic pairing fixture', '-c', 'user.email=fixture@example.invalid', ...args], { cwd, env: environment(), encoding: 'utf8', timeout: 30_000 })
  expect(result.status, result.stderr).toBe(0)
}

function settingsFile(value: string | undefined) {
  writeFileSync(join(dev, '.env'), `MOLE_OFFICE_PORT=${port}\nMOLE_OFFICE_DB=${database}\n${value === undefined ? '' : `MOLE_OFFICE_STABLE_CHECKOUT=${value}\n`}`)
}

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'named-stable-pair-'))
  spawnRequests = join(root, 'spawn-requests.log')
  writeFileSync(spawnRequests, '')
  dev = join(root, 'development'); stable = join(root, 'stable'); third = join(root, 'third'); worktree = join(root, 'worktree')
  home = join(root, 'home'); mkdirSync(home)
  database = join(dev, 'data', 'unopened.sqlite')
  for (const checkout of [dev, stable, third]) {
    mkdirSync(checkout)
    for (const name of copied) cpSync(join(source, name), join(checkout, name), { recursive: true })
    symlinkSync(join(source, 'node_modules'), join(checkout, 'node_modules'))
    git(checkout, 'init', '--quiet', '-b', 'main')
  }
  git(dev, 'add', '--', ...copied); git(dev, 'commit', '--quiet', '-m', 'Synthetic pairing source')
  git(dev, 'worktree', 'add', '--quiet', '-b', 'other-checkout', worktree)
  symlinkSync(join(source, 'node_modules'), join(worktree, 'node_modules'))
  const listener = createServer()
  await new Promise<void>(done => listener.listen(0, '127.0.0.1', done))
  port = (listener.address() as { port: number }).port
  await new Promise<void>(done => listener.close(() => done()))
}, 60_000)
// The spawn request file starts empty in every case, so a case that starts a process is the only case it turns red.
beforeEach(() => { writeFileSync(spawnRequests, ''); settingsFile(stable) })
afterAll(() => { if (root) rmSync(root, { recursive: true, force: true }) })

function dryStart() {
  return [
    "const childProcess=(await import('node:child_process')).default",
    "const {syncBuiltinESMExports}=await import('node:module')",
    "const {appendFileSync}=await import('node:fs')",
    'childProcess.spawn=(command,args,options={})=>{',
    `appendFileSync(${JSON.stringify(spawnRequests)},JSON.stringify({command,args,cwd:options.cwd??null})+'\\n')`,
    "throw Object.assign(new Error('the test refuses to start a process'),{code:'DRY_START'})",
    '}',
    'syncBuiltinESMExports()',
  ].join(';')
}

function probe(checkout: string, { pair = true, expression = '({dev:s.THE_DEVELOPMENT_CHECKOUT,data:s.DATA_ROOT})', tool = '', command = 'start' } = {}) {
  const action = tool === 'service'
    ? `${dryStart()};const {main}=await import('./src/config/the-service-command.mjs');process.exitCode=await main([${JSON.stringify(command)}])`
    : tool === 'copy'
      ? "process.argv=['node','tools/office-copy-through-the-stable-checkout.mjs','sweep','--sandboxes'," + JSON.stringify(join(root, 'sandboxes')) + "];await import('./tools/office-copy-through-the-stable-checkout.mjs')"
      : `const s=await import('./src/config/settings.mjs');console.log(JSON.stringify(${expression}))`
  return spawnSync(process.execPath, ['--input-type=module', '-e', `try{${action}}catch(e){console.error(JSON.stringify({code:e.code,message:e.message}));process.exitCode=1}`], { cwd: checkout, env: environment(pair), encoding: 'utf8', timeout: 15_000 })
}

function expectNothingWasSpawned() {
  expect(readFileSync(spawnRequests, 'utf8')).toBe('')
}

function refusedAtLoad(checkout: string, reason: string) {
  const result = probe(checkout)
  expect(result.status, result.stdout + result.stderr).toBe(1)
  expect(result.stdout).toBe('')
  expect(result.stderr).toContain('DEVELOPMENT_CHECKOUT_INVALID')
  expect(result.stderr).toContain(reason)
  expect(result.stderr).toContain('Nothing was started.')
  expect(existsSync(database)).toBe(false)
  expect(existsSync(join(dev, 'data', 'keys.json'))).toBe(false)
}

it('pairs only the absolute named stable checkout and keeps its data under development', () => {
  const result = probe(stable)
  expect(result.status, result.stderr).toBe(0)
  expect(JSON.parse(result.stdout)).toEqual({ dev, data: `${dev}/` })
  expect(existsSync(database)).toBe(false)
})

it('refuses a development git worktree at settings load before any database is opened', () => {
  expect(existsSync(join(worktree, '.env'))).toBe(false)
  refusedAtLoad(worktree, `names the stable checkout ${stable}, and this checkout is ${worktree}`)
})

it('refuses a third checkout at settings load before any database is opened', () => {
  refusedAtLoad(third, `names the stable checkout ${stable}, and this checkout is ${third}`)
})

it('pairs through a symbolic link to stable and refuses a link to another checkout', () => {
  const stableLink = join(root, 'stable-link'), otherLink = join(root, 'other-link')
  symlinkSync(stable, stableLink); symlinkSync(third, otherLink)
  settingsFile(stableLink)
  const result = probe(stableLink)
  expect(result.status, result.stderr).toBe(0)
  expect(JSON.parse(result.stdout)).toEqual({ dev, data: `${dev}/` })
  refusedAtLoad(otherLink, `names the stable checkout ${stable}, and this checkout is ${third}`)
})

it('refuses a relative stable setting in the database guard, service command and copy wrapper', () => {
  settingsFile('missing-stable')
  const guard = probe(dev, { pair: false, expression: `s.whyThisCheckoutMayNotOpenTheDatabase(${JSON.stringify(database)})` })
  const service = probe(dev, { pair: false, tool: 'service' })
  expectNothingWasSpawned()
  const copy = probe(dev, { pair: false, tool: 'copy' })
  for (const result of [guard, service, copy]) {
    expect(result.status, result.stdout + result.stderr).toBe(1)
    expect(result.stderr).toContain('MOLE_OFFICE_STABLE_CHECKOUT')
    expect(result.stderr).toContain("It must be the stable checkout's absolute path.")
  }
  for (const result of [guard, service]) expect(result.stderr).toContain('STABLE_CHECKOUT_INVALID')
  expect(existsSync(database)).toBe(false)
})

it('reads an empty stable setting as null, refuses pairing and permits development its own database', () => {
  settingsFile('')
  refusedAtLoad(stable, 'names no stable checkout in MOLE_OFFICE_STABLE_CHECKOUT')
  const result = probe(dev, { pair: false, expression: `({named:s.theStableCheckoutNamedIn(s.ENV_FILE),why:s.whyThisCheckoutMayNotOpenTheDatabase(${JSON.stringify(database)})})` })
  expect(result.status, result.stderr).toBe(0)
  expect(JSON.parse(result.stdout)).toEqual({ named: null, why: null })
})

it('refuses pairing with an older development office whose settings name no stable checkout', () => {
  settingsFile(undefined)
  refusedAtLoad(stable, 'names no stable checkout in MOLE_OFFICE_STABLE_CHECKOUT')
})

it('refuses a missing absolute stable folder before the service starts anything', () => {
  const missing = join(root, 'absent-stable')
  settingsFile(missing)
  const result = probe(dev, { pair: false, tool: 'service' })
  expectNothingWasSpawned()
  expect(result.status, result.stdout + result.stderr).toBe(1)
  expect(result.stderr).toContain(`MOLE_OFFICE_STABLE_CHECKOUT in ${join(dev, '.env')} names ${missing}, but no folder is there.`)
  expect(result.stderr).toContain('Nothing was started.')
  expect(existsSync(database)).toBe(false)
})

it('refuses to restart when the named stable folder is missing, and stops nothing', async () => {
  const missing = join(root, 'absent-stable')
  settingsFile(missing)
  const sleeper = spawn('sleep', ['300'], { detached: true, stdio: 'ignore' })
  const group = sleeper.pid
  if (group === undefined) throw new Error('the sleep process did not start')
  sleeper.unref()
  const lockPath = serviceLockPathFrom({ MOLE_OFFICE_DB: database })
  try {
    const taken = await takeTheServiceLock({
      lockPath,
      databasePath: database,
      port,
      checkout: dev,
      pid: group,
      readProcess: theProcessReading,
      starter: group,
    })
    if (!taken.taken) throw new Error(taken.said)
    expect(taken.lock.pgid).toBe(group)
    const result = probe(dev, { pair: false, tool: 'service', command: 'restart' })
    expect(result.status, result.stdout + result.stderr).toBe(1)
    expect(result.stderr).toContain(`MOLE_OFFICE_STABLE_CHECKOUT in ${join(dev, '.env')} names ${missing}, but no folder is there.`)
    expect(result.stderr).toContain('Nothing was stopped.')
    expect(result.stderr).not.toContain('Nothing was started.')
    expect(() => process.kill(-group, 0)).not.toThrow()
    expectNothingWasSpawned()
    expect(existsSync(database)).toBe(false)
  } finally {
    // The sleep is gone only if a restart stopped it; any other failure to stop it is reported.
    try { process.kill(-group, 'SIGTERM') } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error }
    rmSync(lockPath, { force: true })
  }
})
