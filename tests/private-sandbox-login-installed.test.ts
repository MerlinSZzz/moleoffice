// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHETHER THE LOGIN PRESS IS INSTALLED, read from an installation record in an invented home.
 *
 * Each case makes an invented home under the temporary folder, with a record, a stand-in pool, a copy of the stand-in
 * pool tool and a copy of the stand-in `claude` in it. Nothing here reads the owner's ~/.config, and the real holder
 * started here is given the invented home as its HOME.
 */
import { afterAll, afterEach, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { chmodSync, copyFileSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createPrivateLogin } from '../src/holder/private-sandbox-login.mjs'
import { INSTALLATION_RECORD, RECORD_KEYS, THE_POOL, theInstalledLogin } from '../src/holder/private-sandbox-login-installed.mjs'
import { anInventedPool, sha } from './private-sandbox-login-pool-tool-stand.ts'
import { aPlace, holder, startAHolder, stopEverything, until } from './terminal-holder-stand.ts'

const PROGRAM_STAND_IN = fileURLToPath(new URL('./private-sandbox-login-setup-token-stand-in.py', import.meta.url))
const THE_READER = fileURLToPath(new URL('../src/holder/private-sandbox-login-installed.mjs', import.meta.url))
const homes: string[] = []
afterEach(() => { for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true }) })
afterAll(stopEverything, 60_000)

const theCoreLimitIsLowered = () => null

/** An invented home with everything the record names, and the record, mode 600. */
function anInstallation() {
  const f = anInventedPool(homes)
  const claude = join(f.home, 'claude')
  copyFileSync(PROGRAM_STAND_IN, claude)
  chmodSync(claude, 0o755)
  const record: Record<string, unknown> = {
    version: 1, python: '/usr/bin/python3', tool: f.tool, toolSha256: f.toolSha256, pool: join(f.home, THE_POOL), claude,
    claudeCheck: 'an invented sentence about the program',
  }
  const path = join(f.home, INSTALLATION_RECORD)
  const write = (value: unknown) => writeFileSync(path, typeof value === 'string' ? value : JSON.stringify(value), { mode: 0o600 })
  write(record)
  return { ...f, claude, record, path, write, read: (options: Parameters<typeof theInstalledLogin>[0] = {}) => theInstalledLogin({ home: f.home, lowerTheCoreLimit: theCoreLimitIsLowered, ...options }) }
}

it('builds both adapters from a record that holds, and the press is available', () => {
  const i = anInstallation()
  expect(Object.keys(i.record).sort()).toEqual([...RECORD_KEYS])
  const installed = i.read()
  expect(installed.why).toBeNull()
  expect(installed.pool?.available()).toBe(true)
  expect(installed.adapter?.args).toEqual(['--core=0:0', '--', i.claude, 'setup-token'])
  expect(createPrivateLogin({ adapter: installed.adapter, pool: installed.pool }).capability()).toEqual({ version: 1, available: true, code: true })
})

it('builds neither adapter when one condition fails, and says which', () => {
  const cases: [string, (i: ReturnType<typeof anInstallation>) => Parameters<typeof theInstalledLogin>[0] | void, RegExp][] = [
    ['not Linux', () => ({ platform: 'darwin' }), /only on Linux/],
    ['no record', (i) => rmSync(i.path), /there is no installation record at /],
    ['a record others may read', (i) => chmodSync(i.path, 0o644), /mode 600/],
    ['a record that is a link', (i) => { const elsewhere = join(i.home, 'elsewhere.json'); copyFileSync(i.path, elsewhere); rmSync(i.path); symlinkSync(elsewhere, i.path) }, /mode 600/],
    ['a record that is not JSON', (i) => i.write('{ not json'), /is not JSON/],
    ['a key more', (i) => i.write({ ...i.record, written: 'an invented day' }), /has the keys/],
    ['a key less', (i) => { const { claudeCheck: _, ...less } = i.record; i.write(less) }, /has the keys/],
    ['another version', (i) => i.write({ ...i.record, version: 2 }), /not version 1/],
    ['a python that is not absolute', (i) => i.write({ ...i.record, python: 'python3' }), /python is not an absolute path/],
    ['a tool with another sha256', (i) => i.write({ ...i.record, toolSha256: sha('another') }), /with the sha256 the record names/],
    ['a tool its group may write', (i) => chmodSync(i.tool, 0o620), /only this user may change/],
    ['a claude that may not be run', (i) => chmodSync(i.claude, 0o644), /claude at .* is not a program/],
    ['a pool somewhere else', (i) => { const other = join(i.home, 'another-pool'); mkdirSync(other, { mode: 0o700 }); i.write({ ...i.record, pool: other }) }, /the folder the tool uses when it is given only HOME/],
    ['a pool others may read', (i) => chmodSync(join(i.home, THE_POOL), 0o755), /mode 700/],
    ['a core limit that was not lowered', () => ({ lowerTheCoreLimit: () => "this holder's core limit reads 0 unlimited after it was lowered" }), /core limit reads 0 unlimited/],
  ]
  for (const [name, breakIt, why] of cases) {
    const i = anInstallation()
    const installed = i.read(breakIt(i) ?? {})
    expect(installed.adapter, name).toBeNull()
    expect(installed.pool, name).toBeNull()
    expect(installed.why, name).toMatch(why)
    expect(createPrivateLogin({ adapter: installed.adapter, pool: installed.pool }).capability(), name).toEqual({ version: 1, available: false, code: false })
  }
})

it("lowers the holder's own core limit to 0, soft and hard, and reads it back", () => {
  const script = [
    `import { lowerThisHoldersCoreLimit } from ${JSON.stringify(THE_READER)}`,
    `import { readFileSync } from 'node:fs'`,
    `const why = lowerThisHoldersCoreLimit()`,
    `const line = readFileSync('/proc/self/limits', 'utf8').split('\\n').find((one) => one.startsWith('Max core file size')) ?? ''`,
    `process.stdout.write(JSON.stringify({ why, limits: line.split(/\\s{2,}/).slice(1, 3) }))`,
  ].join('\n')
  const said = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], { cwd: '/', env: { PATH: '/usr/bin:/bin' }, encoding: 'utf8', timeout: 20_000 })) as { why: string | null; limits: string[] }
  expect(said).toEqual({ why: null, limits: ['0', '0'] })
})

it('a holder started on a machine with no installation record says why its press is unavailable, and answers so', async () => {
  const place = aPlace('press')
  const started = await startAHolder(place)
  const answer = await holder(place, { op: 'privateLoginCapability' })
  expect(answer).toMatchObject({ ok: true, version: 1, available: false, code: false })
  const said = await until(() => started.output(), (output) => output.includes('the login press is'), 10_000)
  expect(said).toContain(`the login press is unavailable, because there is no installation record at ${join(place.home, INSTALLATION_RECORD)}`)
})
