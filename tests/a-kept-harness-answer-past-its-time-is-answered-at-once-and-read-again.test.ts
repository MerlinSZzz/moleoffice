// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Expired harness answers return while the next read is held back. Only a request starts a read.
 * Stand-in programs count their runs; the stand-in registry counts its requests. Only Date is faked.
 * Mutations and their logs are named in the implementation commit.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import type { HarnessReading } from '../src/shared/harnesses.ts'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'
import { aStandInRegistry, type StandInRegistry } from './harness-stand-ins.ts'
import { freshDb } from './helpers.ts'

type Library = typeof import('../src/server/lib/harnesses.ts') & {
  forgetTheInstalledVersions?: () => void
  waitForTheHarnessReads?: () => Promise<void>
}
type Reading = HarnessReading & { beingReadAgain: { installed: string | null; newest: string | null } }
let library: Library
let resources: typeof import('../src/server/lib/resources.ts')
let db: Awaited<ReturnType<typeof freshDb>>
let dir: string
let bin: string
let registry: StandInRegistry
let registryVersion: string
let registryStatus: number
let holdRegistry: Promise<void> | null
let releaseRegistry: () => void
const firstAt = new Date('2026-10-13T12:00:00.000Z')
const claudePath = '/@anthropic-ai%2Fclaude-code/latest'
const pause = (ms: number) => new Promise<void>((done) => setTimeout(done, ms))

beforeAll(async () => {
  db = await freshDb()
  library = await import('../src/server/lib/harnesses.ts')
  resources = await import('../src/server/lib/resources.ts')
}, 60_000)
afterAll(() => { db?.close() })

/** The executable stays unchanged when its printed version or hold file changes. */
function writeProgram(): void {
  const next = join(bin, 'claude.new')
  writeFileSync(next, `#!/bin/sh\necho ran >> '${dir}/runs'\nwhile [ -f '${dir}/hold' ]; do /bin/sleep 0.01; done\n/bin/cat '${dir}/version'\n`)
  chmodSync(next, 0o755)
  renameSync(next, join(bin, 'claude'))
}
const runs = () => existsSync(join(dir, 'runs')) ? readFileSync(join(dir, 'runs'), 'utf8').trim().split('\n').length : 0
const hits = () => registry.asked.filter((path) => path === claudePath).length
const read = async () => (await library.readTheHarnesses({ PATH: bin })).find((one) => one.id === 'claude-code') as Reading
function releaseProgram(): void {
  if (existsSync(join(dir, 'hold'))) unlinkSync(join(dir, 'hold'))
}
function delayRegistry(): void {
  holdRegistry = new Promise<void>((done) => { releaseRegistry = done })
}
async function until(check: () => boolean): Promise<void> {
  for (let turn = 0; turn < 200; turn += 1) {
    if (check()) return
    await pause(10)
  }
  throw new Error('The stand-in did not run within two seconds.')
}
/** The held probe cannot finish: returning before this deadline proves the answer did not wait for it. */
async function atOnce(pending: Promise<Reading>): Promise<Reading> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([pending, new Promise<never>((_done, fail) => {
      timer = setTimeout(() => fail(new Error('The answer waited for the held read.')), 700)
    })])
  } finally {
    clearTimeout(timer)
  }
}

beforeEach(async () => {
  library.forgetTheNewestVersions()
  library.forgetTheInstalledVersions?.()
  dir = aTestDatabaseFolder('harness-expired')
  bin = join(dir, 'bin')
  mkdirSync(bin)
  writeFileSync(join(dir, 'version'), '2.1.200 (Claude Code)\n')
  writeProgram()
  registry = await aStandInRegistry()
  vi.stubEnv('MOLE_OFFICE_HARNESS_REGISTRY', registry.at)
  registryVersion = '2.1.289'
  registryStatus = 200
  holdRegistry = null
  releaseRegistry = () => {}
  const realFetch = globalThis.fetch
  // Read the local registry, then hold its answer or change its made-up version. Every hit is still counted.
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, options) => {
    const response = await realFetch(input, options)
    if (String(input) !== `${registry.at}${claudePath}`) return response
    await holdRegistry
    return new Response(JSON.stringify({ version: registryVersion }), { status: registryStatus })
  })
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(firstAt)
})

afterEach(async () => {
  releaseRegistry()
  releaseProgram()
  await library.waitForTheHarnessReads?.()
  library.forgetTheNewestVersions()
  library.forgetTheInstalledVersions?.()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  await registry.close()
  removeThisTestFolder(dir)
})

it('the first read waits for both parts; a fresh kept answer asks nothing; time alone asks nothing', async () => {
  delayRegistry()
  writeFileSync(join(dir, 'hold'), '')
  let answered = false
  const pending = read().then((one) => { answered = true; return one })
  await until(() => hits() === 1 && runs() === 1)
  expect(answered).toBe(false)
  releaseRegistry()
  await pause(30)
  expect(answered).toBe(false)
  releaseProgram()
  const first = await pending
  expect(first.beingReadAgain).toEqual({ installed: null, newest: null })
  expect(first.installed.version).toBe('2.1.200 (Claude Code)')
  expect(first.newest.version).toBe('2.1.289')
  // With the program free, another cold read still waits for the held registry.
  library.forgetTheNewestVersions()
  library.forgetTheInstalledVersions?.()
  delayRegistry()
  answered = false
  const registryPending = read().then((one) => { answered = true; return one })
  await until(() => hits() === 2 && runs() === 2)
  await pause(30)
  expect(answered).toBe(false)
  releaseRegistry()
  expect((await registryPending).beingReadAgain).toEqual({ installed: null, newest: null })
  vi.setSystemTime(new Date(firstAt.getTime() + 9 * 60_000))
  expect((await read()).beingReadAgain).toEqual({ installed: null, newest: null })
  expect(hits()).toBe(2)
  expect(runs()).toBe(2)
  vi.setSystemTime(new Date(firstAt.getTime() + 2 * 60 * 60_000))
  await pause(30)
  expect(hits()).toBe(2)
  expect(runs()).toBe(2)
})

it('an expired newest answer returns its own read time while one registry read runs behind all requests', async () => {
  const first = await read()
  vi.setSystemTime(new Date(firstAt.getTime() + 61 * 60_000))
  delayRegistry()
  registryVersion = '2.1.300'
  const old = await atOnce(read())
  expect(old.newest).toEqual(first.newest)
  expect(old.beingReadAgain.newest).toBe(first.newest.readAt)
  await until(() => hits() === 2)
  for (let n = 0; n < 4; n += 1) {
    const another = await atOnce(read())
    expect(another.newest).toEqual(first.newest)
    expect(another.beingReadAgain.newest).toBe(first.newest.readAt)
  }
  await pause(30)
  expect(hits()).toBe(2)
  releaseRegistry()
  await library.waitForTheHarnessReads?.()
  const next = await read()
  expect(next.newest).toMatchObject({ read: true, version: '2.1.300' })
  expect(next.beingReadAgain.newest).toBeNull()
  expect(hits()).toBe(2)
})

it('an expired installed answer returns its read time while one probe runs behind all requests', async () => {
  const first = await read()
  vi.setSystemTime(new Date(firstAt.getTime() + 11 * 60_000))
  writeFileSync(join(dir, 'hold'), '')
  writeFileSync(join(dir, 'version'), '2.1.300 (Claude Code)\n')
  const old = await atOnce(read())
  expect(old.installed).toEqual(first.installed)
  expect(old.beingReadAgain).toEqual({ installed: firstAt.toISOString(), newest: null })
  await until(() => runs() === 2)
  for (let n = 0; n < 4; n += 1) {
    expect((await atOnce(read())).beingReadAgain.installed).toBe(firstAt.toISOString())
  }
  await pause(30)
  expect(runs()).toBe(2)
  releaseProgram()
  await library.waitForTheHarnessReads?.()
  const next = await read()
  expect(next.installed.version).toBe('2.1.300 (Claude Code)')
  expect(next.beingReadAgain.installed).toBeNull()
  expect(runs()).toBe(2)
})

it('a changed file past ten minutes is probed now and waited for', async () => {
  await read()
  vi.setSystemTime(new Date(firstAt.getTime() + 11 * 60_000))
  writeProgram()
  writeFileSync(join(dir, 'version'), '2.1.301 (Claude Code)\n')
  writeFileSync(join(dir, 'hold'), '')
  let answered = false
  const pending = read().then((one) => { answered = true; return one })
  try {
    await until(() => runs() === 2)
    await pause(30)
    expect(answered).toBe(false)
  } finally {
    releaseProgram()
  }
  const next = await pending
  expect(next.installed.version).toBe('2.1.301 (Claude Code)')
  expect(next.beingReadAgain.installed).toBeNull()
})

it('a missing PATH file never returns the kept installed version', async () => {
  await read()
  vi.setSystemTime(new Date(firstAt.getTime() + 11 * 60_000))
  unlinkSync(join(bin, 'claude'))
  const next = await read()
  expect(next.installed).toMatchObject({ path: null, versionWasRead: false })
  expect(next.beingReadAgain.installed).toBeNull()
})

it('a failed registry read replaces the kept version and is kept for one minute before reading behind again', async () => {
  const first = await read()
  vi.setSystemTime(new Date(firstAt.getTime() + 61 * 60_000))
  delayRegistry()
  registryStatus = 503
  expect((await atOnce(read())).newest).toEqual(first.newest)
  releaseRegistry()
  await library.waitForTheHarnessReads?.()
  const failed = await read()
  expect(failed.newest).toMatchObject({ read: false, version: null })
  expect(failed.beingReadAgain.newest).toBeNull()
  expect(hits()).toBe(2)
  vi.setSystemTime(new Date(Date.now() + 59_000))
  expect((await read()).newest).toEqual(failed.newest)
  expect(hits()).toBe(2)
  vi.setSystemTime(new Date(Date.now() + 2_000))
  delayRegistry()
  registryStatus = 200
  registryVersion = '2.1.302'
  const oldFailure = await atOnce(read())
  expect(oldFailure.newest).toEqual(failed.newest)
  expect(oldFailure.beingReadAgain.newest).toBe(failed.newest.readAt)
  releaseRegistry()
  await library.waitForTheHarnessReads?.()
  expect((await read()).newest).toMatchObject({ read: true, version: '2.1.302' })
})

it('a throwing background probe warns once and forgets the kept installed read; the next request throws', async () => {
  await read()
  vi.setSystemTime(new Date(firstAt.getTime() + 11 * 60_000))
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const probe = resources.osProbe()
  const realProbe = probe.theVersionOfAProgram?.bind(probe)
  const method = vi.spyOn(probe, 'theVersionOfAProgram').mockImplementation((program, env) => {
    if (program === 'claude') return Promise.reject(new Error('The example probe broke.'))
    if (realProbe === undefined) throw new Error('No program probe in this test.')
    return realProbe(program, env)
  })
  const old = await atOnce(read())
  expect(old.installed.versionWasRead).toBe(true)
  await library.waitForTheHarnessReads?.()
  expect(warning).toHaveBeenCalledTimes(1)
  expect(warning.mock.calls.flat().join(' ')).toContain('claude')
  expect(warning.mock.calls.flat().join(' ')).toContain('The example probe broke.')
  await expect(read()).rejects.toThrow('The example probe broke.')
  expect(method).toHaveBeenCalled()
})

it('a background probe that reads no version forgets the kept installed read and asks again next time', async () => {
  await read()
  vi.setSystemTime(new Date(firstAt.getTime() + 11 * 60_000))
  writeFileSync(join(dir, 'version'), '')
  writeFileSync(join(dir, 'hold'), '')
  expect((await atOnce(read())).installed.versionWasRead).toBe(true)
  releaseProgram()
  await library.waitForTheHarnessReads?.()
  expect(runs()).toBe(2)
  writeFileSync(join(dir, 'version'), '2.1.303 (Claude Code)\n')
  const next = await read()
  expect(next.installed).toMatchObject({ versionWasRead: true, version: '2.1.303 (Claude Code)' })
  expect(next.beingReadAgain.installed).toBeNull()
  expect(runs()).toBe(3)
})
