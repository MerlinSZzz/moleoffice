// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Whether the parent of the server answering is Mole Office's own dev supervisor, read from its
 * program and its arguments rather than from the words of its command line.
 *
 * orphanReport leaves that one process out of the orphans and says why. On Linux it reads the
 * parent's program from /proc/<pid>/exe and its arguments from /proc/<pid>/cmdline, split on NUL,
 * so a path with a space stays one argument. The program counts when it is the same file as this
 * server's own node, by realpath, whatever it is called. A Linux read that fails leaves the row
 * unchecked, with the reason, and the words are not read in its place. A probe with no list of
 * arguments (macOS's ps has none) keeps the reading by words, and the report says so wherever it
 * names the supervisor.
 *
 * In a Linux bundle the window and the office's command run on the same program as the server, so there only the
 * script says which process is the supervisor (case 3c).
 *
 * Built probes and built folders only: nothing is started, and no live process is read.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { freshDb, one, type TestDb } from './helpers.ts'

type ResourcesLib = typeof import('../src/server/lib/resources.ts')
type OsProbe = ResourcesLib['LINUX_PROBE']
type OsProcess = NonNullable<ReturnType<OsProbe['processById']>>

const HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const

let t: TestDb
let res: ResourcesLib
let folders: string[]

beforeEach(async () => {
  // Imported after freshDb, because importing lib/resources.ts opens the database it points at.
  t = await freshDb()
  res = await import('../src/server/lib/resources.ts')
  folders = []
})

afterEach(() => {
  for (const folder of folders) rmSync(folder, { recursive: true, force: true })
  t.close()
})

/** A folder that afterEach removes. */
function aFolder(): string {
  const folder = mkdtempSync(join(tmpdir(), 'mole-office-supervisor-'))
  folders.push(folder)
  return folder
}

/**
 * A machine where the parent of this test process is alive with the command line given, and nothing else runs.
 * `programAndArguments` is left off the probe when it is not given, as the macOS probe leaves it off.
 */
function aProbe(platform: string, command: string, programAndArguments?: OsProbe['programAndArguments']): OsProbe {
  const parent: OsProcess = { pid: process.ppid, pgid: 400, ppid: 1, command, startedAt: '2026-10-22 09:00:00' }
  return {
    platform,
    processById: (pid) => (pid === process.ppid ? parent : null),
    processesInGroup: (pgid) => (pgid === parent.pgid ? [parent] : []),
    listeningPorts: () => [],
    gpu: () => ({ available: true, processes: [] }),
    containers: () => ({ available: true, containers: [] }),
    locks: () => ({ files: [], unreadable: [] }),
    ownProcessGroup: () => 999_999,
    killProcessGroup: () => {
      throw new Error('nothing is signalled in this file')
    },
    stopContainer: () => {
      throw new Error('nothing is stopped in this file')
    },
    ...(programAndArguments === undefined ? {} : { programAndArguments }),
  }
}

/** The parent's ledger row, written by a run that has since finished, so it is an orphan unless it is recognised. */
function aFinishedRunsRow(probe: OsProbe): string {
  res.useOsProbe(probe)
  const run = t.api.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title: 'The dev supervisor',
    data: { state: 'running', runtime: 'claude-code' },
    actor: t.api.HUMAN,
  }).id
  const row = res.registerResource({ workspaceId: 'default', sessionRecordId: run, type: 'process', key: String(process.ppid), actor: HUMAN }).id
  t.api.patchRecord(run, { dataPatch: { state: 'finished' } }, t.api.HUMAN)
  return row
}

const THE_WORDS_NOTE = 'recognised by the words of its command line, not by its arguments'

describe('on Linux, the supervisor is known by its program and its arguments', () => {
  it('1. a node reached by a path with a space is read as one argument, and the parent is the supervisor', () => {
    const bin = join(aFolder(), 'my node', 'bin')
    mkdirSync(bin, { recursive: true })
    const node = join(bin, 'node')
    symlinkSync(process.execPath, node)
    const row = aFinishedRunsRow(aProbe('linux', `${node} tools/serve-dev.mjs --built`, () => ({
      program: realpathSync(node),
      arguments: [node, 'tools/serve-dev.mjs', '--built'],
    })))
    const report = res.orphanReport('default')
    expect(report.orphans).toEqual([])
    expect(report.unchecked).toEqual([])
    expect(one(report.officeSupervisors, 'the supervisor').id).toBe(row)
    expect(report.unclaimed.summary).toContain("Mole Office's own dev supervisor is alive")
    expect(report.unclaimed.summary).not.toContain(THE_WORDS_NOTE)
  })

  it.each(['nodejs', 'node22'])('2. this server’s own node under the name %s is the same program', (name) => {
    const other = join(aFolder(), name)
    symlinkSync(process.execPath, other)
    const row = aFinishedRunsRow(aProbe('linux', `${other} tools/serve-dev.mjs --built`, () => ({
      program: other,
      arguments: [other, 'tools/serve-dev.mjs', '--built'],
    })))
    const report = res.orphanReport('default')
    expect(report.orphans).toEqual([])
    expect(one(report.officeSupervisors, 'the supervisor').id).toBe(row)
  })

  it('3. another program called node is not the supervisor, and its row stays an orphan', () => {
    const other = join(aFolder(), 'node')
    writeFileSync(other, '#!/bin/sh\n', { mode: 0o755 })
    const row = aFinishedRunsRow(aProbe('linux', 'node tools/serve-dev.mjs --built', () => ({
      program: other,
      arguments: ['node', 'tools/serve-dev.mjs', '--built'],
    })))
    const report = res.orphanReport('default')
    expect(report.officeSupervisors).toEqual([])
    expect(one(report.orphans, 'the other program').id).toBe(row)
  })

  it('3b. this server’s own node running another checkout’s serve-dev is not the supervisor either', () => {
    const row = aFinishedRunsRow(aProbe('linux', `${process.execPath} /another/checkout/tools/serve-dev.mjs --built`, () => ({
      program: process.execPath,
      arguments: [process.execPath, '/another/checkout/tools/serve-dev.mjs', '--built'],
    })))
    const report = res.orphanReport('default')
    expect(report.officeSupervisors).toEqual([])
    expect(one(report.orphans, 'the other checkout’s supervisor').id).toBe(row)
  })

  it.each([
    ['the window', [process.execPath]],
    ['the command a login unit runs', [process.execPath, '/opt/mole-office/resources/office/mole-office.mjs', 'watch']],
  ])('3c. this server’s own program running %s is not the supervisor, and its row stays an orphan', (what, programAndArguments) => {
    const row = aFinishedRunsRow(aProbe('linux', programAndArguments.join(' '), () => ({
      program: process.execPath,
      arguments: programAndArguments,
    })))
    const report = res.orphanReport('default')
    expect(report.officeSupervisors, `${what}, on the server's own program, is taken for the supervisor`).toEqual([])
    expect(one(report.orphans, what).id).toBe(row)
  })

  it('5. a read that fails leaves the row unchecked with the reason, and the words are not read instead', () => {
    const unreadable = `/proc/${process.ppid}/exe could not be read (EACCES)`
    const row = aFinishedRunsRow(aProbe('linux', 'node tools/serve-dev.mjs --built', () => ({ unreadable })))
    const report = res.orphanReport('default')
    expect(report.officeSupervisors).toEqual([])
    expect(report.orphans).toEqual([])
    const unchecked = one(report.unchecked, 'the parent whose program could not be read')
    expect(unchecked.id).toBe(row)
    expect(unchecked.reason).toContain("whether it is Mole Office's own dev supervisor is unknown")
    expect(unchecked.reason).toContain(unreadable)
  })

  it('5b. a program that cannot be resolved leaves the row unchecked too', () => {
    const missing = join(aFolder(), 'gone', 'node')
    const row = aFinishedRunsRow(aProbe('linux', 'node tools/serve-dev.mjs --built', () => ({
      program: missing,
      arguments: ['node', 'tools/serve-dev.mjs', '--built'],
    })))
    const report = res.orphanReport('default')
    expect(report.officeSupervisors).toEqual([])
    expect(report.orphans).toEqual([])
    const unchecked = one(report.unchecked, 'the parent whose program could not be resolved')
    expect(unchecked.id).toBe(row)
    expect(unchecked.reason).toContain("whether it is Mole Office's own dev supervisor is unknown")
    expect(unchecked.reason).toContain(missing)
  })
})

describe('a probe with no list of arguments keeps the words, and says so', () => {
  it('4. on macOS the supervisor is recognised by its words, and the note is in each place that names it', () => {
    const row = aFinishedRunsRow(aProbe('darwin', 'node tools/serve-dev.mjs --built'))
    const report = res.orphanReport('default')
    expect(report.orphans).toEqual([])
    const supervisor = one(report.officeSupervisors, 'the supervisor')
    expect(supervisor.id).toBe(row)
    if (supervisor.liveness.state !== 'alive') throw new Error(`the supervisor is ${supervisor.liveness.state}, not alive`)
    const skipped = one(report.unclaimed.skipped.filter((note) => note.what.includes('dev supervisor')), 'the skipped note')
    for (const text of [supervisor.liveness.detail, skipped.reason, report.unclaimed.summary]) {
      expect(text).toContain(THE_WORDS_NOTE)
      expect(text).toContain('darwin')
      expect(text).toContain('a path with a space in it can be misread')
    }
  })

  it('4b. on macOS a node path with a space splits, so that parent is not recognised: the limit the note names', () => {
    const row = aFinishedRunsRow(aProbe('darwin', '/Applications/My Tools/bin/node tools/serve-dev.mjs --built'))
    const report = res.orphanReport('default')
    expect(report.officeSupervisors).toEqual([])
    expect(one(report.orphans, 'the parent read by its words').id).toBe(row)
  })

  it('4c. the macOS probe has no list of arguments to give, and the Linux probe has', () => {
    expect(res.theProbeForThisPlatform('darwin').programAndArguments).toBeUndefined()
    expect(res.LINUX_PROBE.programAndArguments).toBeTypeOf('function')
  })
})

describe('the Linux reading of a process’s program and arguments', () => {
  it('6. keeps each argument whole, and names the file it could not read', () => {
    const proc = aFolder()
    mkdirSync(join(proc, '4242'))
    symlinkSync(process.execPath, join(proc, '4242', 'exe'))
    writeFileSync(join(proc, '4242', 'cmdline'), '/opt/my node/bin/node\0tools/serve-dev.mjs\0--built\0')
    expect(res.theProgramAndArgumentsIn(proc, 4242)).toEqual({
      program: realpathSync(process.execPath),
      arguments: ['/opt/my node/bin/node', 'tools/serve-dev.mjs', '--built'],
    })

    mkdirSync(join(proc, '4243'))
    writeFileSync(join(proc, '4243', 'cmdline'), 'node\0tools/serve-dev.mjs\0')
    expect(res.theProgramAndArgumentsIn(proc, 4243)).toEqual({ unreadable: expect.stringContaining(join(proc, '4243', 'exe')) })

    mkdirSync(join(proc, '4244'))
    symlinkSync(process.execPath, join(proc, '4244', 'exe'))
    expect(res.theProgramAndArgumentsIn(proc, 4244)).toEqual({ unreadable: expect.stringContaining(join(proc, '4244', 'cmdline')) })
  })
})
