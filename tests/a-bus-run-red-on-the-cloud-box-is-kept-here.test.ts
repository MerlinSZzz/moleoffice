// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A BUS RUN RED ON THE CLOUD BOX IS KEPT HERE. The merge tool asks the cloud box to run a bus's whole suite, and the
 * box's report and log come back into the entry's sandbox, where a later run writes the same names again. Until this
 * round nothing else kept them, so a file the box named red could be in no log on this machine: the kept report of a
 * bus run showed that file passing. Now, when the box names red files, the box's own report is kept by a function the
 * merge tool gives, and each red file is written into the merge tool's own log, which a later run only adds to: how
 * many of its cases failed, the first of them by name, the first line of its error, and the line of the file that
 * error names. A file that failed with no case, such as one that did not load, gives its own error.
 *
 * EVERY CASE HERE IS MADE UP: tests/stand-in-cloud-suite-door.mjs stands in for the door, and nothing reaches the box.
 * The names and errors are read from the report the stand-in hands back, so none is copied here.
 *
 * MUTATION PROOF (logs named in the report of the run that added this file), each alone after a green control:
 *   - the door's caller writes no line for a red file: the case goes red;
 *   - the box's report is not kept: the case goes red.
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'

import { aSuiteOnTheBoxOrHere } from '../tools/merge-tool/cloud-suite-door.mjs'

const REPO = join(import.meta.dirname, '..')
const STAND_IN = join(REPO, 'tests', 'stand-in-cloud-suite-door.mjs')
/** A path that is not the stand-in, standing for the real door. It is never called. */
const NOT_THE_STAND_IN = join(REPO, 'tools', 'cloud-suite.mjs')
const COMMIT = 'c'.repeat(40)

type Case = { fullName?: string; status?: string; failureMessages?: string[] }
type Result = { name: string; status: string; message?: string; assertionResults: Case[] }

let root = ''

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cloud-box-red-kept-'))
  mkdirSync(join(root, 'clone'))
  mkdirSync(join(root, 'reports'))
  mkdirSync(join(root, 'entry'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

/** The first line of an error that is not empty. */
const firstLineOf = (error: string): string => error.split('\n').find((line) => line.trim() !== '')?.trim() ?? ''

it('keeps the box\'s own report of a red bus run, and writes each red file into the log with its first failed case, its error and its line', async () => {
  const box = {
    clone: join(root, 'clone'),
    commit: COMMIT,
    report: join(root, 'reports', 'pair-suite.json'),
    reads: join(root, 'reports', 'pair-suite-reads'),
    suiteLog: join(root, 'reports', 'pair-suite.log'),
    timeoutSec: 10800,
  }
  const env = { PATH: String(process.env['PATH']), HOME: join(root, 'home'), STAND_IN_DOOR_DOES: 'red-in-words' }
  const lines: string[] = []
  const keptReports: { from: string; kept: string }[] = []
  // THE OPTIONS ARE BUILT FIRST, so this file type-checks against the door's caller before it takes the new one.
  const options = {
    label: 'pair-suite',
    box,
    here: () => { throw new Error('the bus suite ran here, though the box ran it') },
    hereIs: 'in sandbox made-up-sandbox',
    door: STAND_IN,
    theRealDoor: NOT_THE_STAND_IN,
    run: (label: string, command: string, args: string[], { cwd }: { cwd: string }) => {
      const outFile = join(root, `${label}.log`)
      const done = spawnSync(command, args, { cwd, encoding: 'utf8', env, timeout: 10_000 })
      writeFileSync(outFile, `${done.stdout}${done.stderr}`)
      return Promise.resolve({ code: done.status, signal: done.signal, timedOut: false, stoppedReason: null, outFile })
    },
    log: (line: string) => lines.push(line),
    keepTheLog: (file: string) => {
      const kept = join(root, 'entry', 'pair-suite.log')
      copyFileSync(file, kept)
      return kept
    },
    keepTheBoxReport: (file: string) => {
      const kept = join(root, 'entry', `kept-${String(keptReports.length + 1)}.json`)
      copyFileSync(file, kept)
      keptReports.push({ from: file, kept })
      return kept
    },
    env: {},
  }
  const ran = await aSuiteOnTheBoxOrHere(options)
  expect(ran).toMatchObject({ code: 1, where: 'box', box: { ran: true } })

  const answer = JSON.parse(readFileSync(join(root, 'pair-suite-door.log'), 'utf8').trim().split('\n').at(-1) ?? '') as { failed: string[] }
  expect(answer.failed.length, 'the stand-in names two red files').toBe(2)
  expect(keptReports.map((one) => one.from), 'the box\'s own report is kept, once').toEqual([box.report])
  const kept = keptReports[0]!.kept
  expect(lines.filter((line) => line.includes(kept)), 'one line of the log says where the box\'s report is kept').toHaveLength(1)

  // THE KEPT REPORT IS THE BOX'S, and a later run that writes the sandbox's report again does not change it.
  writeFileSync(box.report, '{"testResults": []}\n')
  const results = (JSON.parse(readFileSync(kept, 'utf8')) as { testResults: Result[] }).testResults
  const red = results.filter((one) => one.status === 'failed').map((one) => relative(box.clone, one.name)).sort()
  expect(red, 'the kept report names the files the box failed').toEqual([...answer.failed].sort())

  for (const file of answer.failed) {
    const result = results.find((one) => relative(box.clone, one.name) === file)!
    const failedCases = result.assertionResults.filter((one) => one.status === 'failed')
    const said = lines.filter((line) => line.includes(file) && !line.includes(kept))
    expect(said, `one line of the log names ${file}`).toHaveLength(1)
    if (failedCases.length > 0) {
      const error = failedCases[0]!.failureMessages![0]!
      const at = new RegExp(`${file.replaceAll('.', '\\.')}:(\\d+)`).exec(error)?.[1]
      expect(at, `the stand-in's error names a line of ${file}`).toBeDefined()
      expect(said[0], 'the line names the first failed case').toContain(String(failedCases[0]!.fullName))
      expect(said[0], 'the line gives the first line of its error').toContain(firstLineOf(error))
      expect(said[0], 'the line gives the line of the file its error names').toMatch(new RegExp(`\\b${String(at)}\\b`))
      for (const passed of result.assertionResults.filter((one) => one.status === 'passed')) {
        expect(said[0], 'a case that passed is not named').not.toContain(String(passed.fullName))
      }
    } else {
      expect(said[0], 'a file with no failed case gives its own error').toContain(firstLineOf(String(result.message)))
    }
  }
})
