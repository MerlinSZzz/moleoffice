// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MESSAGE WORKER'S LOG BELONGS TO THE CHECKOUT THE OFFICE SERVES FROM.
 *
 * A paired office serves from the stable checkout and keeps its database under the development
 * checkout. Its own log follows the serving checkout, not the development one, because the
 * development checkout changes with each landing. No real server is started: the folder is decided
 * by one export, the first case checks it behaviourally, and the third ties the server's worker
 * start to that export.
 */
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, expect, it } from 'vitest'

const source = fileURLToPath(new URL('..', import.meta.url))
const copied = ['src']
let root: string, dev: string, stable: string, database: string, home: string, port: number

function environment(pair = false): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: home, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' }
  for (const key of Object.keys(env)) if (key.startsWith('MOLE_') || key.startsWith('VITEST')) delete env[key]
  if (pair) env.MOLE_OFFICE_DEVELOPMENT_CHECKOUT = dev
  return env
}

function git(cwd: string, ...args: string[]) {
  const result = spawnSync('git', ['-c', 'user.name=Synthetic serving fixture', '-c', 'user.email=fixture@example.invalid', ...args], { cwd, env: environment(), encoding: 'utf8', timeout: 30_000 })
  expect(result.status, result.stderr).toBe(0)
}

function settingsFile() {
  writeFileSync(join(dev, '.env'), `MOLE_OFFICE_PORT=${port}\nMOLE_OFFICE_DB=${database}\nMOLE_OFFICE_STABLE_CHECKOUT=${stable}\n`)
}

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'worker-log-serving-'))
  dev = join(root, 'development'); stable = join(root, 'stable')
  home = join(root, 'home'); mkdirSync(home)
  database = join(dev, 'data', 'unopened.sqlite')
  for (const checkout of [dev, stable]) {
    mkdirSync(checkout)
    for (const name of copied) cpSync(join(source, name), join(checkout, name), { recursive: true })
    symlinkSync(join(source, 'node_modules'), join(checkout, 'node_modules'))
    git(checkout, 'init', '--quiet', '-b', 'main')
  }
  git(dev, 'add', '--', ...copied); git(dev, 'commit', '--quiet', '-m', 'Synthetic serving source')
  const listener = createServer()
  await new Promise<void>(done => listener.listen(0, '127.0.0.1', done))
  port = (listener.address() as { port: number }).port
  await new Promise<void>(done => listener.close(() => done()))
  settingsFile()
}, 60_000)
afterAll(() => { if (root) rmSync(root, { recursive: true, force: true }) })

function probe(checkout: string, pair = true) {
  const action = "const s=await import('./src/config/settings.mjs');console.log(JSON.stringify({log:s.THE_WORKER_LOG_ROOT,data:s.DATA_ROOT}))"
  return spawnSync(process.execPath, ['--input-type=module', '-e', `try{${action}}catch(e){console.error(JSON.stringify({code:e.code,message:e.message}));process.exitCode=1}`], { cwd: checkout, env: environment(pair), encoding: 'utf8', timeout: 15_000 })
}

it('paired, the log is under the serving checkout', async () => {
  const result = probe(stable)
  expect(result.status, result.stderr).toBe(0)
  const seen = JSON.parse(result.stdout) as { log?: string; data?: string }
  expect(seen.data).toBe(`${dev}/`)
  expect(seen.log).toBe(`${stable}/`)
  // Loading the server's worker module opens the database named here, so it is a scratch file and
  // not the development database named in the settings. That one stays uncreated.
  process.env.MOLE_OFFICE_DB = join(root, 'the-log-test-loader.sqlite')
  const { theWorkerLogPath } = await import('../src/server/lib/worker.ts')
  const log = theWorkerLogPath(seen.log as string, 29940, 'aaaaaaaaaaaa')
  expect(log.startsWith(`${stable}/.logs/`)).toBe(true)
  expect(log.startsWith(`${dev}/`)).toBe(false)
  expect(existsSync(database)).toBe(false)
})

it('unpaired, the log is under the checkout itself', () => {
  const result = probe(dev, false)
  expect(result.status, result.stderr).toBe(0)
  expect(JSON.parse(result.stdout)).toEqual({ log: `${dev}/`, data: `${dev}/` })
  expect(existsSync(database)).toBe(false)
})

