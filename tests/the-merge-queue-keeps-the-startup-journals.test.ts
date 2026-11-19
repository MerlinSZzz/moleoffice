// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MERGE QUEUE KEEPS THE BOX'S STARTUP JOURNALS BESIDE THE LOG IT KEEPS (tools/cloud-suite.criteria.md, criterion
 * 22). The door puts the journals in the folder beside the suite log, named after it: `suite.log` keeps them in
 * `suite-startup-journals`. For a merge entry that folder is in the entry's sandbox, which is cleared once the entry is
 * final, so the queue keeps the log in the entry's own folder. Since this file, the journals are kept beside the kept
 * log, as the criterion says. They are checked against their index as the door checks them, and copied as the door
 * left them, bounded and masked. They are not masked again: masking a masked line again changes it.
 *
 * EVERY CASE HERE IS MADE UP: tests/stand-in-cloud-suite-door.mjs stands in for the door, and this file writes the
 * journals beside the log after it, masked, as the real door hands them back. Nothing reaches the box. The
 * secret-shaped value, the login and the home folder below are made up.
 *
 * MUTATION PROOF (logs named in the report of the run that added this file), each alone after a green control:
 *   - the journals are not kept beside the kept log: the first case goes red;
 *   - the journals are kept without the check against their index: the third case goes red;
 *   - journals an earlier run kept under the same name are left: the second case goes red.
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'

import { maskedAsAPrintedLine } from '../src/config/inspection-ending.mjs'
import { ONE_JOURNAL_KEEPS_AT_MOST, THE_JOURNALS_KEEP_AT_MOST, THE_JOURNALS_LOOKED_FOR } from '../tools/cloud-suite-journals.mjs'
import { aSuiteOnTheBoxOrHere } from '../tools/merge-tool/cloud-suite-door.mjs'

const REPO = join(import.meta.dirname, '..')
const STAND_IN = join(REPO, 'tests', 'stand-in-cloud-suite-door.mjs')
/** A path that is not the stand-in, standing for the real door. It is never called. */
const NOT_THE_STAND_IN = join(REPO, 'tools', 'cloud-suite.mjs')
const COMMIT = 'd'.repeat(40)
const A_JOURNAL = `setup-waits-${'e'.repeat(64)}-4242.jsonl`
/** One made-up journal line with a secret-shaped value, a login and a home folder in it, which the door masks. */
const UNMASKED = '{"stage":"made-up start","env":"MADE_UP_TOKEN=made-up-value-not-a-secret","by":"made-up-login@made-up-host.invalid","at":"/home/made-up-user/clone"}\n'
const THE_LOCKS_OWNER = 'pid 4242, a made-up build\n'

let root = ''
let lines: string[] = []

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'merge-queue-journals-'))
  mkdirSync(join(root, 'clone'))
  mkdirSync(join(root, 'reports'))
  mkdirSync(join(root, 'entry'))
  lines = []
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

const theBox = () => ({
  clone: join(root, 'clone'),
  commit: COMMIT,
  report: join(root, 'reports', 'suite.json'),
  reads: join(root, 'reports', 'suite-reads'),
  suiteLog: join(root, 'reports', 'suite.log'),
  timeoutSec: 10800,
})
/** The folder beside the box's log, in the sandbox, and the one beside the log the queue keeps, in the entry's folder. */
const theBoxsJournals = () => join(root, 'reports', 'suite-startup-journals')
const theKeptJournals = () => join(root, 'entry', 'suite-startup-journals')

/** The journals as the door hands them back: two files, masked as a printed line, and their index with the door's own bounds. */
function journalsAsTheDoorHandsThemBack(extra: Record<string, string> = {}) {
  const folder = theBoxsJournals()
  mkdirSync(folder)
  writeFileSync(join(folder, A_JOURNAL), maskedAsAPrintedLine(UNMASKED))
  writeFileSync(join(folder, 'server-for-tests-lock-who.txt'), THE_LOCKS_OWNER)
  for (const [name, text] of Object.entries(extra)) writeFileSync(join(folder, name), text)
  const files = [
    { from: `.logs/${A_JOURNAL}`, file: A_JOURNAL, bytes: Buffer.byteLength(UNMASKED), keptBytes: Buffer.byteLength(UNMASKED) },
    { from: 'dist/server-for-tests-lock/who.txt', file: 'server-for-tests-lock-who.txt', bytes: Buffer.byteLength(THE_LOCKS_OWNER), keptBytes: Buffer.byteLength(THE_LOCKS_OWNER) },
  ]
  writeFileSync(join(folder, 'index.json'), JSON.stringify({ oneAtMost: ONE_JOURNAL_KEEPS_AT_MOST, allAtMost: THE_JOURNALS_KEEP_AT_MOST, lookedFor: THE_JOURNALS_LOOKED_FOR, files }))
}

/** A green run on the box through the stand-in door, which then hands back the journals `afterTheDoor` writes, and the log kept in the entry's folder. */
async function aGreenRunOnTheBox(afterTheDoor: () => void) {
  const env = { PATH: String(process.env['PATH']), HOME: join(root, 'home'), STAND_IN_DOOR_DOES: 'green' }
  return aSuiteOnTheBoxOrHere({
    label: 'suite',
    box: theBox(),
    here: () => { throw new Error('the suite ran here, though the box ran it') },
    hereIs: 'in sandbox made-up-sandbox',
    door: STAND_IN,
    theRealDoor: NOT_THE_STAND_IN,
    run: (label: string, command: string, args: string[], { cwd }: { cwd: string }) => {
      const outFile = join(root, `${label}.log`)
      const done = spawnSync(command, args, { cwd, encoding: 'utf8', env, timeout: 10_000 })
      writeFileSync(outFile, `${done.stdout}${done.stderr}`)
      afterTheDoor()
      return Promise.resolve({ code: done.status, signal: done.signal, timedOut: false, stoppedReason: null, outFile })
    },
    log: (line: string) => lines.push(line),
    // THE MERGE TOOL'S keepTheLog copies the log into the entry's folder, where nothing in the sandbox can change it.
    keepTheLog: (file: string) => {
      const kept = join(root, 'entry', 'suite.log')
      rmSync(kept, { force: true })
      copyFileSync(file, kept)
      return kept
    },
    env: {},
  })
}

const theLinesAboutJournals = () => lines.filter((line) => line.includes('startup journals'))

it('keeps the box\'s startup journals beside the log it keeps, checked against their index and as the door masked them, and says where', async () => {
  const ran = await aGreenRunOnTheBox(() => journalsAsTheDoorHandsThemBack())
  expect(ran).toMatchObject({ code: 0, where: 'box', outFile: join(root, 'entry', 'suite.log') })
  const kept = theKeptJournals()
  expect(existsSync(kept), 'the journals are kept beside the kept log, in the entry\'s folder').toBe(true)
  expect(readdirSync(kept).sort()).toEqual([A_JOURNAL, 'index.json', 'server-for-tests-lock-who.txt'].sort())
  expect(readFileSync(join(kept, 'index.json'), 'utf8'), 'the index is the door\'s, with its bounds').toBe(readFileSync(join(theBoxsJournals(), 'index.json'), 'utf8'))
  const journal = readFileSync(join(kept, A_JOURNAL), 'utf8')
  expect(journal, 'the kept journal is the one the door masked, byte for byte').toBe(readFileSync(join(theBoxsJournals(), A_JOURNAL), 'utf8'))
  for (const word of ['made-up-value-not-a-secret', 'made-up-login@', '/home/made-up-user']) expect(journal).not.toContain(word)
  expect(readFileSync(join(kept, 'server-for-tests-lock-who.txt'), 'utf8')).toBe(THE_LOCKS_OWNER)
  expect(theLinesAboutJournals()).toEqual([`suite: the cloud box's startup journals are kept at ${kept}: 2 file(s), 0 cut, 0 not kept by the box`])
})

it('keeps no journals when the box hands back none, and removes those an earlier run of the same name kept', async () => {
  mkdirSync(theKeptJournals())
  writeFileSync(join(theKeptJournals(), A_JOURNAL), 'an earlier run\'s made-up journal\n')
  await aGreenRunOnTheBox(() => {})
  expect(existsSync(theKeptJournals()), 'an earlier run\'s journals are not left beside this run\'s log').toBe(false)
  expect(theLinesAboutJournals()).toEqual([])
})

it('keeps no journals that do not match their index, and says why', async () => {
  await aGreenRunOnTheBox(() => journalsAsTheDoorHandsThemBack({ 'not-in-the-index.txt': 'a made-up file the index does not name\n' }))
  expect(existsSync(theKeptJournals()), 'journals that do not match their index are not kept').toBe(false)
  expect(theLinesAboutJournals()).toEqual([
    `suite: the cloud box's startup journals at ${theBoxsJournals()} are not kept, because the cloud box returned startup journals that do not match their index`,
  ])
})
