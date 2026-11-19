// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN INVENTED POOL FOR THE LOGIN PRESS'S POOL ADAPTER, and the scan for a login's value, shared by
 * tests/private-sandbox-login-pool-tool.test.ts and tests/private-sandbox-login-setup-token.test.ts.
 *
 * This module starts nothing. The adapter it builds runs a copy of tests/private-sandbox-login-pool-tool-stand-in.py
 * when a case adds a login, and the copy refuses to start in any home that is not an invented one.
 */
import { expect } from 'vitest'
import { createHash } from 'node:crypto'
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PORTS_VARIABLE, TEST_FILE_VARIABLE, THE_IMPORT } from '../tools/live-office-guard.mjs'
import { privatePool } from '../src/server/lib/sandbox-login-addition/pool.mjs'
import { thePoolToolAdapter } from '../src/holder/private-sandbox-login-pool-tool.mjs'

export const POOL_TOOL_STAND_IN = fileURLToPath(new URL('./private-sandbox-login-pool-tool-stand-in.py', import.meta.url))
const THE_POOL = join('.config', 'mole-office', 'claude-logins')

export const sha = (value: string | Buffer, length = 64) => createHash('sha256').update(value).digest('hex').slice(0, length)

/** What the stand-in tool wrote down about one run of it. It never holds the value. */
export interface PoolToolReport {
  argv: string[]
  environ: Record<string, string>
  core: number[]
  pid: number
  pgid: number
  sid: number
  cwd: string
  stdin: string
  stderrIsNull: boolean
  valueBytes?: number
}

const THE_RECORDER = realpathSync(fileURLToPath(new URL('../tools/record-what-tests-read.mjs', import.meta.url)))
const THE_RECORDERS_VARIABLES = ['TEST_READ_ROOT', 'TEST_READ_RECORD']
const theRecordersImport = (word: string) => {
  const path = word.startsWith('--import=') ? word.slice('--import='.length) : ''
  return path !== '' && existsSync(path) && realpathSync(path) === THE_RECORDER
}

/**
 * The environment an adapter gave a child, from the one the child was started with.
 *
 * THE TEST RUNNER'S OWN PRELOADS give every child started with an environment of its own their variables back, inside
 * `spawn`: the live-office guard its import in NODE_OPTIONS, its ports and the test file's name; the read recorder, when
 * the merge queue's run loads it, its import, TEST_READ_ROOT and TEST_READ_RECORD. Those are taken out, once each is
 * seen to be the preload's own, and what is left is what the adapter gave.
 */
export function whatTheAdapterGave(environ: Record<string, string>): Record<string, string> {
  const given = { ...environ }
  const imports = (given['NODE_OPTIONS'] ?? '').split(' ').filter((word) => word !== '')
  expect(imports.filter((word) => word !== THE_IMPORT && !theRecordersImport(word)), "the child's NODE_OPTIONS holds more than the test runner's preloads").toEqual([])
  for (const name of ['NODE_OPTIONS', PORTS_VARIABLE, TEST_FILE_VARIABLE]) delete given[name]
  for (const name of THE_RECORDERS_VARIABLES) {
    const set = process.env[name]
    if (set !== undefined && set !== '' && given[name] === resolve(set)) delete given[name]
  }
  return given
}

/**
 * An invented home under the temporary folder, with a stand-in pool holding A and B, and a copy of the stand-in tool,
 * mode 600. Its folder is added to `homes`, for the case's own clearing.
 */
export function anInventedPool(homes: string[]) {
  const home = mkdtempSync(join(tmpdir(), 'invented-private-home-'))
  homes.push(home)
  const root = join(home, THE_POOL)
  mkdirSync(root, { recursive: true })
  chmodSync(root, 0o700)
  const index: { version: number; logins: Record<string, unknown> } = { version: 1, logins: {} }
  for (const letter of ['A', 'B']) {
    const value = `invented-existing-${letter}`
    writeFileSync(join(root, `${letter}.token`), value + '\n', { mode: 0o600 })
    index.logins[letter] = { sha12: sha(value, 12), added: '2026-01-01 12:00', by: 'invented-owner' }
  }
  writeFileSync(join(root, 'index.json'), JSON.stringify(index) + '\n', { mode: 0o600 })
  const tool = join(home, 'pool-tool.py')
  copyFileSync(POOL_TOOL_STAND_IN, tool)
  chmodSync(tool, 0o600)
  const toolSha256 = sha(readFileSync(tool))
  const adapter = thePoolToolAdapter({ python: '/usr/bin/python3', tool, toolSha256, home })
  const reports = (): PoolToolReport[] => {
    const folder = join(home, 'reports')
    if (!existsSync(folder)) return []
    return readdirSync(folder).filter((name) => name.endsWith('.json')).map((name) => JSON.parse(readFileSync(join(folder, name), 'utf8')) as PoolToolReport)
  }
  return {
    home, root, tool, toolSha256, adapter, reports,
    pool: privatePool({ tool: adapter }),
    fault: (words: string) => writeFileSync(join(home, 'fault'), words),
    index: () => JSON.parse(readFileSync(join(root, 'index.json'), 'utf8')) as { logins: Record<string, { sha12: string; by: string; operation?: string }> },
  }
}

/**
 * Look for each value in every file under each folder, except the pool's own token files, which hold a value by design,
 * and in `written`. A file that has gone while it is read is passed over.
 */
export function expectNoValueIn(folders: string[], values: string[], written: string) {
  for (const folder of folders) {
    if (!existsSync(folder)) continue
    for (const name of readdirSync(folder, { recursive: true }).map(String)) {
      if (name.startsWith(THE_POOL) && name.endsWith('.token')) continue
      let bytes: Buffer
      try { bytes = readFileSync(join(folder, name)) } catch { continue }
      for (const value of values) expect(bytes.includes(value), `${relative(folder, join(folder, name))} holds a login's value`).toBe(false)
    }
  }
  for (const value of values) expect(written.includes(value), 'this test process wrote a value to stdout or stderr').toBe(false)
}
