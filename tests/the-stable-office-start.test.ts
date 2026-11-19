// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, expect, it } from 'vitest'

const SOURCE = fileURLToPath(new URL('..', import.meta.url))
let root: string
let dev: string
let stable: string
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'stable-office-start-'))
  dev = join(root, 'development'); stable = join(root, 'stable')
  mkdirSync(dev); mkdirSync(stable)
  for (const checkout of [dev, stable]) {
    for (const name of ['src', 'tools', 'for-agents', 'package.json', 'tsconfig.json']) cpSync(join(SOURCE, name), join(checkout, name), { recursive: true })
    symlinkSync(join(SOURCE, 'node_modules'), join(checkout, 'node_modules'))
    expect(spawnSync('git', ['init', '--quiet', checkout]).status).toBe(0)
  }
}, 60_000)
afterAll(() => rmSync(root, { recursive: true, force: true }))

function start(paired: boolean, line: string, mode = 'ordinary') {
  writeFileSync(join(dev, '.env'), `MOLE_OFFICE_PORT=41326\nMOLE_OFFICE_DB=${join(root, 'unopened.sqlite')}\n${line}\n`)
  const cwd = paired ? stable : dev
  const env: Record<string, string | undefined> = { ...process.env, HOME: join(root, 'home') }
  for (const key of Object.keys(env)) if (key.startsWith('MOLE_') || key.startsWith('VITEST')) delete env[key]
  if (paired) env.MOLE_OFFICE_DEVELOPMENT_CHECKOUT = dev
  env.MOLE_OFFICE_START_MODE = mode
  // This invalid option is read after the guard. Removing the start guard must expose it.
  return spawnSync(process.execPath, ['--import', 'tsx', 'src/server/index.ts', '--stop-with-pid=invalid'], { cwd, env, encoding: 'utf8', timeout: 30_000 })
}

it('refuses stable when dev names no stable checkout, before reading later start options', () => {
  const read = start(true, '')
  expect(read.status).not.toBe(0)
  expect(read.stderr).toContain('MOLE_OFFICE_STABLE_CHECKOUT')
  expect(read.stderr).not.toContain('stop-with-pid')
})
it('refuses stable when dev names another checkout', () => {
  const read = start(true, `MOLE_OFFICE_STABLE_CHECKOUT=${dev}`)
  expect(read.stderr).toContain('MOLE_OFFICE_STABLE_CHECKOUT')
  expect(read.stderr).toContain(dev)
  expect(read.stderr).not.toContain('stop-with-pid')
})
it('refuses a dev server before any lock, database or port is taken', () => {
  const read = start(false, `MOLE_OFFICE_STABLE_CHECKOUT=${stable}`)
  expect(read.stderr).toContain('MOLE_OFFICE_STABLE_CHECKOUT')
  expect(read.stderr).toContain('node tools/stable/upgrade-stable.mjs')
  expect(read.stderr).not.toContain('stop-with-pid')
})
it('checks pairing before the release-check branch', () => {
  const read = start(true, '', 'release-check')
  expect(read.stderr).toContain('MOLE_OFFICE_STABLE_CHECKOUT')
  expect(read.stderr).not.toContain('ENOENT')
})
