// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY SANDBOX IS HELD TO THE OWNER'S DEFAULTS, set in one place. The
 * problem was TotXlPFHFduz, and the owner's message is from 3 October 2026,
 * 16:30.
 * That day at 16:09 a script in the release sandbox grew to 75 GB in 60
 * seconds on a machine of 93 GB, and the owner's machine froze, because no sandbox container had a limit. These cases pin
 * the figures, the raises a template may declare, and the raise a merge sandbox takes. The real templates' own
 * limits are pinned in tests/the-real-sandbox-templates-keep-their-own-limits.test.ts.
 * tests/sandbox-launcher.test.ts pins that `up` passes the limits, and tests/an-isolated-run-cannot-reach-the-office.test.ts
 * that an isolated run's container does.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { SANDBOX_DEFAULTS, SANDBOX_MEMORY_MARGIN, SANDBOX_SHM, SANDBOX_SLICE, bytesOfAMemoryFigure, theCgroupMemoryPath, noRoomInMemory, setsALimitItself, theLimitsOfASandbox, theRoomForPictures, theSandboxLimitArgs, theSandboxLimits } from '../tools/sandbox-common.mjs'

const REASON = 'The simulator keeps its whole scene in shared memory, which counts against the limit.'
const template = (name: string, file: string) => JSON.parse(readFileSync(join('sandboxes', name, file), 'utf8'))

it("mutation DEFAULTS: the owner's figures, 16 GB with swap counted in it, 8 cores below the desktop's priority, 2000 processes", () => {
  expect(SANDBOX_DEFAULTS).toEqual({ memory: '16g', cpus: '8', cpuShares: '256', pidsLimit: '2000' })
  expect(Object.isFrozen(SANDBOX_DEFAULTS)).toBe(true)
  expect(theSandboxLimits(undefined)).toEqual(SANDBOX_DEFAULTS)
})

it('mutation SWAP: the run arguments hold swap to the memory figure, so a container cannot fill the swap instead', () => {
  expect(theSandboxLimitArgs()).toEqual(['--memory=16g', '--memory-swap=16g', '--cpus=8', '--cpu-shares=256', '--pids-limit=2000', '--cgroup-parent=system-molesandboxes.slice'])
  expect(theSandboxLimitArgs({ memory: '48g', cpus: '12', cpuShares: '256', pidsLimit: '4000' }))
    .toEqual(['--memory=48g', '--memory-swap=48g', '--cpus=12', '--cpu-shares=256', '--pids-limit=4000', '--cgroup-parent=system-molesandboxes.slice'])
})

// ONE MEMORY LIMIT FOR ALL SANDBOXES TOGETHER, in the owner's message of 6 October
// 2026. Every container goes under one slice, nested in system.slice where every
// container already was, so a limit on the slice holds them all.
it('mutation ONE_SLICE: every container, with or without a raise, goes under the one slice, nested in system.slice', () => {
  expect(SANDBOX_SLICE).toBe('system-molesandboxes.slice')
  expect(SANDBOX_SLICE.startsWith('system-'), 'a slice outside system.slice would take processors from the desktop').toBe(true)
  for (const limits of [SANDBOX_DEFAULTS, theSandboxLimits({ memory: '48g', because: REASON })]) {
    expect(theSandboxLimitArgs(limits).filter((one) => one.startsWith('--cgroup-parent='))).toEqual([`--cgroup-parent=${SANDBOX_SLICE}`])
  }
})

// PROBLEM TKH0KMph-bMR (wave 13t's round 19; message qvGijAIvHJmk): docker's 64 MB of /dev/shm was too small for
// Electron's pictures, and a picture that did not fit killed the GPU process.
it('mutation SHM: a container whose template names no /dev/shm size gets 1 GB', () => {
  expect(SANDBOX_SHM).toEqual({ size: '1g' })
  expect(theRoomForPictures()).toEqual(['--shm-size=1g'])
  expect(theRoomForPictures(['--network=host'])).toEqual(['--shm-size=1g'])
})

// MEMORY ADMISSION (message 1R4wqZ70yUA0): on 5 October 2026 at 19:43 the machine ran short of memory, and the
// sandboxes' limits together allow far more than it holds. A start needs what its container may still take, and 8 GiB.
it('mutations MEMORY_MARGIN and MEMORY_USED: a start needs what the container may still take under its limit, plus 8 GiB', () => {
  const GiB = 2 ** 30
  expect(SANDBOX_MEMORY_MARGIN).toEqual({ bytes: 8 * GiB, gib: 8 })
  expect(bytesOfAMemoryFigure('16g')).toBe(16 * GiB)
  expect(bytesOfAMemoryFigure('512m')).toBe(512 * 2 ** 20)
  expect(bytesOfAMemoryFigure('sixteen')).toBeNull()
  expect(noRoomInMemory({ available: 24 * GiB, limit: 16 * GiB })).toBeNull()
  expect(noRoomInMemory({ available: 24 * GiB - 1, limit: 16 * GiB })).toContain('under the 24 GiB this start needs')
  expect(noRoomInMemory({ available: 18 * GiB, limit: 16 * GiB, used: 6 * GiB })).toBeNull()
  expect(noRoomInMemory({ available: 17 * GiB, limit: 16 * GiB, used: 6 * GiB }))
    .toBe('the machine has 17 GiB of memory available, under the 18 GiB this start needs: the 10 GiB the sandbox may still take under its 16 GiB limit, and 8 GiB kept for the desktop and the office')
})

it('mutation RAISE: a template raises a limit with its reason beside it, and keeps every other default', () => {
  expect(theSandboxLimits({ memory: '48g', because: REASON })).toEqual({ ...SANDBOX_DEFAULTS, memory: '48g' })
  expect(theSandboxLimits({ cpus: '12', pidsLimit: '4000', because: REASON })).toEqual({ ...SANDBOX_DEFAULTS, cpus: '12', pidsLimit: '4000' })
})

it('mutation RAISE_NEEDS_A_REASON: a raise with no reason, or a reason that is not a sentence, is refused', () => {
  expect(() => theSandboxLimits({ memory: '48g' }, 'x/sandbox.json')).toThrow('x/sandbox.json raises memory without its reason')
  expect(() => theSandboxLimits({ memory: '48g', because: 'more' }, 'x/sandbox.json')).toThrow('without its reason')
  expect(() => theSandboxLimits({ because: REASON }, 'x/sandbox.json')).toThrow('raises nothing')
})

it('mutations RAISE_ONLY_UP, RAISE_FORM and RAISE_WHAT_MAY: a raise must be above its default, in the form docker takes, and only of what may be raised', () => {
  expect(() => theSandboxLimits({ memory: '8g', because: REASON })).toThrow('not above the default 16g')
  expect(() => theSandboxLimits({ memory: '16g', because: REASON })).toThrow('not above the default 16g')
  expect(() => theSandboxLimits({ memory: '48GB', because: REASON })).toThrow('not a whole number of gigabytes')
  expect(() => theSandboxLimits({ cpus: '4', because: REASON })).toThrow('not above the default 8')
  // CPU priority stays below the desktop's: it is not raised.
  expect(() => theSandboxLimits({ cpuShares: '1024', because: REASON })).toThrow('may not raise')
  expect(() => theSandboxLimits('48g')).toThrow('is not an object')
})

it("mutation RUNARGS_LIMIT: a template's runArgs may not set a limit themselves, in any of docker's spellings", () => {
  for (const runArgs of [['--memory=48g'], ['--memory', '48g'], ['-m', '48g'], ['-m48g'], ['--memory-swap=1g'], ['--cpus=16'],
    ['--cpu-shares=1024'], ['-c', '1024'], ['--cpu-quota=1600000'], ['--cpu-period', '100000'], ['--pids-limit=-1'], ['--memory-reservation=8g'],
    ['--cgroup-parent=user.slice'], ['--cgroup-parent', 'another.slice']]) {
    expect(setsALimitItself(runArgs), runArgs.join(' ')).toBe(true)
  }
  for (const runArgs of [[], ['--network=host'], ['--gpus=all', '--shm-size=16g'], ['--memory-swappiness=0'], ['--cpuset-cpus=0-3'], ['--network=host', '--gpus=all', '--shm-size=2g']]) {
    expect(setsALimitItself(runArgs), runArgs.join(' ')).toBe(false)
  }
})

// A MERGE SANDBOX'S RAISE (a recorded decision, 7 November 2026): a merge sandbox runs the whole suite, and at 16 GiB one
// lost three headless browsers in the middle of one. mole-office-dev asks 24 GiB for it under "raisesForAMerge". It counts
// only for a sandbox up is given both the label mole-office.merge-entry and the name the merge queue makes,
// merge-<entry>-<six hex> (tools/merge-tool/office-keeper.mjs), so a line that gives its own sandbox the label stays at
// 16 GiB. tests/sandbox-launcher.test.ts pins that up passes it and that its memory admission reads it.
it('mutations MERGE_RAISE and MERGE_NAME: a sandbox labelled and named as the merge queue makes it takes 24 GiB, and every other stays at 16', () => {
  const dev = template('mole-office-dev', 'sandbox.json')
  const where = 'sandboxes/mole-office-dev/sandbox.json'
  const entry = { 'mole-office.merge-entry': 'Quill' }
  expect(theLimitsOfASandbox(dev, where, 'merge-quill-3f9a1c', entry)).toEqual({ limits: { ...SANDBOX_DEFAULTS, memory: '24g' }, raised: 'merge' })
  expect(theLimitsOfASandbox(dev, where, 'merge-take-back-3-0a1b2c', { 'mole-office.merge-entry': 'take-back-3' }).limits.memory).toBe('24g')
  expect(dev.raisesForAMerge.because).toMatch(/whole suite/)
  expect(dev.raisesForAMerge.because).toMatch(/decision [A-Za-z0-9_-]{12}\b/)
  const others: [string, Record<string, string>][] = [
    ['w13q', entry],
    ['merge-quill', entry],
    ['merge-quill-3f9a1', entry],
    ['merge-quill-3f9a1c', {}],
    ['merge-quill-3f9a1c', { 'mole-office.merge-entry': '' }],
    ['merge-quill-3f9a1c', { 'mole-office.sandbox': 'Quill' }],
  ]
  for (const [name, labels] of others) {
    expect(theLimitsOfASandbox(dev, where, name, labels), `${name} ${JSON.stringify(labels)}`).toEqual({ limits: SANDBOX_DEFAULTS, raised: 'no' })
  }
  // A merge raise is held to the rules of any raise, and its sentence names where it was read.
  expect(() => theLimitsOfASandbox({ raisesForAMerge: { memory: '24g' } }, 'x/sandbox.json', 'merge-quill-3f9a1c', entry))
    .toThrow('x/sandbox.json ("raisesForAMerge") raises memory without its reason')
})

// Synthetic membership text: no host process or cgroup files are read.
it('mutation CGROUP_PATH: only a usable v2 membership names the memory file, under either docker slice', () => {
  for (const path of ['/system.slice/system-molesandboxes.slice/docker-synthetic.scope', '/system.slice/docker-synthetic.scope', '/']) {
    expect(theCgroupMemoryPath(`7:cpu:/ignored\n0::${path}\n`)).toBe(`/sys/fs/cgroup${path === '/' ? '' : path}/memory.current`)
  }
  for (const text of ['', '1:memory:/old', '0::', '0::relative', '0::/system.slice/../docker-synthetic.scope', '0::/..']) {
    expect(theCgroupMemoryPath(text), text).toBeNull()
  }
})
