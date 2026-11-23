// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * NO TEST OF THIS CHECKOUT CAN WRITE INTO THE HOME OF WHOEVER IS RUNNING IT.
 *
 * Problem `hlNgNPM9hGTh`, 24 September 2026. Measurement agents unpacked this checkout with
 * `git archive` into throwaway folders and ran its tools inside them, with the real `HOME`. The
 * owner's own `~/.claude/settings.json` gained three pairs of hook lines, each running a session
 * hook in a folder that was about to be deleted, and every Claude Code session on the machine ran
 * all four pairs. Nobody saw it for a day, because in the office's own checkout the same write
 * changes nothing the second time.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED HERE
 * ---------------------------------------------------------------------------------------
 *
 *   1. Every test file is given a home of its own, and it is not the home the run started with.
 *   2. A write under the home the run started with fails at the call, with a sentence naming the
 *      call and the path, and nothing is written.
 *   3. The same write is refused when it is spelled through `node:fs/promises`.
 *   4. `~/.cache/mole-office` on that home is still open, because office regulations chapter 3
 *      rule 1 sends this project's own files — worktrees and sandboxes — there.
 *   5. `vitest.config.ts` names the setup file, so no test file can be collected without it.
 *   6. No test file puts the old home back, and the files that replace `node:fs` for themselves —
 *      and so replace the guard — are named here one by one.
 *   7. `testShots()` answers a fresh folder of this run's own under the system's temporary folder,
 *      or a folder under the one `TEST_SHOTS` names, and never the handback folder. No test file
 *      names the handback folder (problem 4G3nLvf60ydX). The fresh folder is gone after its test
 *      file's tests, a skipped file leaves none, and a folder `TEST_SHOTS` names is kept (check
 *      dwwpG2NYGqFR, precedent ToxCUBqVhdPI).
 *   8. No test names a fixed path inside this checkout's `.logs/` (problem x25LcNeJ7RFi). A test
 *      writes into a temporary folder of its own, made with `mkdtempSync`, or into the folder an
 *      environment variable names. The `.logs/` folder itself may be named, so it can be made first.
 *      The files that still name such a path are listed here one by one, each with its reason.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THESE CASES NEVER PUT A FILE IN THE OWNER'S HOME, EVEN WITH THE GUARD TAKEN OUT
 * ---------------------------------------------------------------------------------------
 *
 * A case that proved the guard by writing a real file would write that file for real on the run
 * where somebody has broken the guard — which is exactly the run where it must not. So every
 * refused write below aims at a file inside a folder that is not there:
 * `<home>/a-folder-no-test-may-make/...`. With the guard in place the guard's own sentence comes
 * back. With the guard gone the call fails because the folder does not exist, the case goes red on
 * the sentence it was expecting, and nothing has been created either way. The last assertion of
 * each case says the folder is still not there.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath, URL } from 'node:url'

import { theHomeBeforeTheTests } from './the-home-before-the-tests.ts'
import { TEST_SHOTS } from './where-shots-go.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

/**
 * THE FIXTURES FOR `testShots()`: a test file that asks for its folder at load, as the four browser
 * tests do, writes where it was answered into the file `SHOTS_REPORT` names, and takes a "picture";
 * and one whose only test is skipped. Each runs in a child vitest, in a folder of its own.
 */
const WHERE_SHOTS_GO = join(ROOT, 'tests', 'where-shots-go.ts')
const A_FILE_THAT_TAKES_A_PICTURE = `
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { it } from 'vitest'
import { testShots } from ${JSON.stringify(WHERE_SHOTS_GO)}
const one = testShots(process.env.SHOTS_NAME ?? 'a-fixture')
const two = process.env.TEST_SHOTS ? one : testShots('a-fixture')
it('takes a picture', () => {
  mkdirSync(one, { recursive: true })
  const picture = join(one, 'a-picture.png')
  writeFileSync(picture, 'not really a picture')
  writeFileSync(process.env.SHOTS_REPORT ?? '', JSON.stringify({ one, two, where: one, picture }))
})
`
const A_FILE_THAT_IS_SKIPPED = `
import { writeFileSync } from 'node:fs'
import { it } from 'vitest'
import { testShots } from ${JSON.stringify(WHERE_SHOTS_GO)}
const one = testShots('a-skipped-fixture')
writeFileSync(process.env.SHOTS_REPORT ?? '', JSON.stringify({ one }))
it.skip('would take a picture', () => {})
`
const FIXTURE_FOLDERS: string[] = []

/** Run one fixture file in a child vitest, with TEST_SHOTS set to `named` or unset, and answer its report. */
function aFixtureRun(name: string, source: string, named?: string): string {
  const folder = mkdtempSync(join(tmpdir(), 'shots-fixture-'))
  FIXTURE_FOLDERS.push(folder)
  mkdirSync(join(folder, 'tests'))
  const file = join(folder, 'tests', `${name}.test.ts`)
  writeFileSync(file, source)
  const report = join(folder, 'report.json')
  const env: NodeJS.ProcessEnv = { ...process.env, SHOTS_REPORT: report, SHOTS_NAME: name }
  delete env[TEST_SHOTS]
  if (named !== undefined) env[TEST_SHOTS] = named
  const run = spawnSync(process.execPath, [join(ROOT, 'node_modules', 'vitest', 'vitest.mjs'), 'run', `--dir=${folder}`, file], { cwd: ROOT, env, encoding: 'utf8', timeout: 200_000 })
  if (run.status !== 0 || !existsSync(report)) throw new Error(`the fixture ${name} did not run (exit ${String(run.status)}): ${run.stdout}\n${run.stderr}`)
  return readFileSync(report, 'utf8')
}

/** The folder every refused write below aims into, which no run ever makes. */
const A_FOLDER_NO_TEST_MAY_MAKE = join(theHomeBeforeTheTests(), 'a-folder-no-test-may-make')

/** Where the setup file that does all of this lives, named once. */
const THE_SETUP_FILE = 'tests/a-test-writes-into-no-home-but-its-own.ts'

/**
 * THE TEST FILES THAT REPLACE `node:fs` FOR THEMSELVES, and why each one is allowed to.
 *
 * A file that mocks `node:fs` gets its own module in place of the wrapped one, so the guard does
 * not see that file's writes. That is a real hole and it is named here rather than left to be
 * found: a new file that mocks `node:fs` turns this case red until somebody writes down why.
 */
const FILES_THAT_REPLACE_NODE_FS: Readonly<Record<string, string>> = {
  'tests/the-key-file-can-gain-an-entry.test.ts':
    'it makes writing the key file fail on purpose, to prove the caller is told. Its own writes all ' +
    'go to a scratch directory it makes under the system temporary folder.',
  'tests/the-sandbox-rounds-are-read-only-when-changed.test.ts':
    'it counts the files a read opens, so its readFileSync counts each call under the seeded folder and passes ' +
    'every call on unchanged. Its own writes all go to a scratch directory it makes under the system temporary folder.',
  'tests/the-office-writes-a-brief-into-a-sandbox.test.ts':
    'it answers the brief writer\'s own realpathSync, lstatSync and writeFileSync once with a made-up answer, to prove ' +
    'the writer refuses when a folder is swapped or a write fails. Every other call is the real one. Its own writes all ' +
    'go to a scratch directory it makes under the system temporary folder.',
  'tests/the-sandboxes-claude-login-is-read-from-its-own-event.test.ts':
    'it names the files a read opens, to prove a round that is not a reading round has its out never opened, so its ' +
    'readFileSync and openSync note each path under the seeded folder and pass every call on unchanged. Its own writes ' +
    'all go to a scratch directory it makes under the system temporary folder.',
  'tests/a-plugin-has-a-manifest-and-a-switch.test.ts':
    'it answers lstatSync for one made-up plugin\'s plugin.json with a character device, a block device or a kind with ' +
    'no name, because no device file can be made without root and lstat reports a link as a link. Every other call is ' +
    'the real one. Its own writes and its throwaway office\'s database all go to scratch directories it makes under the ' +
    'system temporary folder.',
  'tests/the-database-holder-check-reads-locks-for-unreadable-processes.test.ts':
    'it lists a made-up fd folder in number order, as /proc does, and can remove one of its entries after the listing ' +
    'and before the holder rule reads it, to prove a descriptor that goes in that moment is skipped. Only readdirSync is ' +
    'wrapped, and every other call is the real one. Its own writes all go to a scratch directory it makes under the ' +
    'system temporary folder.',
  'tests/the-gate-count-spool-is-handed-over-by-the-person.test.ts':
    'it makes the press\'s removal of a made-up spool\'s .world fail on purpose in one case, to prove the press then ' +
    'adds a second line to the rejects file and leaves .world as it was. Only unlinkSync is wrapped, and every other ' +
    'call, and unlinkSync in every other case, is the real one. Its own writes, its made-up spool and its scratch ' +
    'office\'s database all go to scratch directories it makes under the system temporary folder.',
  'tests/a-check-that-hits-the-5-hour-limit-holds-new-checks.test.ts':
    'it makes a second look at one check\'s output file by its path, by readFileSync or statSync, throw as if the file ' +
    'had gone, to prove the check worker reads a limit\'s words and the time they were written from one open of the ' +
    'file. Only readFileSync and statSync are wrapped, and every other call, and both for every other path, is the real ' +
    'one. Its own writes all go to scratch directories it makes under the system temporary folder, and its database ' +
    'to the test database folder.',
  'tests/the-skill-entry-on-windows-is-a-junction.test.ts':
    'it notes every call the entry press makes to symlink in node:fs/promises, with its arguments, because Node ignores ' +
    'the third argument, which asks for a junction, everywhere but Windows, so only the call shows it. In one case it ' +
    'also makes the press\'s rename onto the settings file fail, to prove the link it put back is a junction again. ' +
    'Only symlink and rename are wrapped, and each passes every call on to the real one but that one rename. Its own ' +
    'writes all go to scratch directories it makes under the system temporary folder.',
  'tests/the-entrys-press-does-not-hold-the-servers-thread.test.ts':
    'it notes every Sync call of node:fs and node:child_process that the entry press makes, with the path it names, to ' +
    'prove the press makes none and so leaves the server\'s thread free. Every call is passed on to the real one. Its own ' +
    'writes all go to a scratch directory it makes under the system temporary folder, and its database to the test ' +
    'database folder.',
}

/** Every `*.test.ts` directly under `tests/`, with its text. */
function everyTestFile(): { path: string; source: string }[] {
  const folder = join(ROOT, 'tests')
  return readdirSync(folder)
    .filter((name) => name.endsWith('.test.ts'))
    .sort()
    .map((name) => ({ path: `tests/${name}`, source: readFileSync(join(folder, name), 'utf8') }))
}

describe('every test file is given a home of its own', () => {
  it('points HOME at a directory that is there and is not the home the run started with', () => {
    const home = process.env.HOME
    expect(typeof home, 'no HOME at all: the setup file did not run').toBe('string')
    expect(home).not.toBe('')
    expect(home, 'HOME is still the home the run started with').not.toBe(theHomeBeforeTheTests())
    expect(existsSync(home as string), 'HOME names a directory that is not there').toBe(true)
    // It is where chapter 3 rule 1 sends this project's own files, and its name says what it is,
    // so an operator who finds one left behind knows what made it.
    expect(home as string).toContain(join(theHomeBeforeTheTests(), '.cache', 'mole-office', 'test-homes'))
    expect(home as string).toContain('a-test-home-')
  })

  it('is the home os.homedir() answers, which is what the installer and the tools read', async () => {
    const { homedir } = await import('node:os')
    expect(homedir()).toBe(process.env.HOME)
  })
})

describe('a write under the home the run started with is refused', () => {
  it('fails at the call, names the call and the path, and writes nothing', () => {
    const target = join(A_FOLDER_NO_TEST_MAY_MAKE, 'a-file-no-test-may-write')
    expect(() => writeFileSync(target, 'this must never be written', 'utf8')).toThrow(
      /writeFileSync/,
    )
    expect(() => writeFileSync(target, 'this must never be written', 'utf8')).toThrow(
      new RegExp(theHomeBeforeTheTests().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    )
    expect(existsSync(A_FOLDER_NO_TEST_MAY_MAKE), 'the refused write made the folder').toBe(false)
  })

  it('refuses a directory the same way', () => {
    expect(() => mkdirSync(join(A_FOLDER_NO_TEST_MAY_MAKE, 'deeper'))).toThrow(/mkdirSync/)
    expect(existsSync(A_FOLDER_NO_TEST_MAY_MAKE), 'the refused write made the folder').toBe(false)
  })

  it('refuses the same write spelled through node:fs/promises', () => {
    // It throws where the call was made rather than handing back a rejected promise: a path under
    // that home is a mistake in the test, not something the disk did. The setup file says why.
    const target = join(A_FOLDER_NO_TEST_MAY_MAKE, 'a-file-no-test-may-write')
    expect(() => writeFile(target, 'this must never be written', 'utf8')).toThrow(/writeFile/)
    expect(existsSync(A_FOLDER_NO_TEST_MAY_MAKE), 'the refused write made the folder').toBe(false)
  })

})

describe('the one folder under that home a test may still write', () => {
  it('lets a write into ~/.cache/mole-office through, which is where chapter 3 rule 1 sends it', () => {
    const mine = join(
      theHomeBeforeTheTests(),
      '.cache',
      'mole-office',
      `a-test-checked-the-home-guard-${String(process.pid)}`,
    )
    try {
      mkdirSync(mine, { recursive: true })
      writeFileSync(join(mine, 'what-this-is.txt'), 'A test checked the home guard and removed this.\n', 'utf8')
      expect(existsSync(join(mine, 'what-this-is.txt'))).toBe(true)
    } finally {
      rmSync(mine, { recursive: true, force: true })
    }
  })
})

/**
 * A TEST'S PICTURES GO INTO A FOLDER OF ITS OWN, NEVER INTO THE HANDBACK FOLDER. Problem 4G3nLvf60ydX.
 *
 * Until then `tests/where-shots-go.ts` answered `~/.cache/mole-office/handback-shots/<name>` on the
 * home the run started with, so four browser tests rewrote that shared folder on every run. The rule
 * is that a test that takes pictures writes them only into its own temporary folder, or into a
 * folder an environment variable names. So `testShots()` makes a fresh folder under `os.tmpdir()`
 * each time it is called, and only when `TEST_SHOTS` names a folder does it use a folder under that.
 *
 * THE LAST CASE READS EVERY TEST FILE, so a new test that writes the handback path out again is
 * caught on the day it is written.
 *
 * MUTATIONS: put the handback path back in `testShots()`; the first case goes red on the folder, and
 * the last goes red because `where-shots-go.ts` names the handback folder again. Take the deletion
 * out of `testShots()` (no `afterAll`); the case after a picture goes red, naming the folder left
 * behind. Put back the code before the fix, a folder made at load and never deleted; that case and
 * the case after a skipped file both go red. Delete the folder even when TEST_SHOTS names one; the
 * kept picture goes red.
 */
describe("a test's pictures go into a folder of its own", () => {
  // WITHOUT TEST_SHOTS THE FOLDER IS THE TEST FILE'S OWN, AND IT IS GONE AFTER THE FILE'S TESTS.
  // Check dwwpG2NYGqFR on precedent ToxCUBqVhdPI: each call made a folder under /tmp at load and
  // nothing deleted it, so every run left picture folders behind, and a skipped file left one too.
  // `testShots()` registers the file's `afterAll`, and that cannot be done from inside a test, so these
  // cases run small test files of their own in a child vitest and read what they left.
  describe('without TEST_SHOTS, a folder of the test file\'s own that is gone after its tests', () => {
    let taken: { one: string; two: string; picture: string } = { one: '', two: '', picture: '' }
    let skipped = ''
    let kept = { where: '', picture: '' }
    let named = ''

    beforeAll(() => {
      named = mkdtempSync(join(tmpdir(), 'named-shots-'))
      taken = JSON.parse(aFixtureRun('takes-a-picture', A_FILE_THAT_TAKES_A_PICTURE))
      skipped = JSON.parse(aFixtureRun('is-skipped', A_FILE_THAT_IS_SKIPPED)).one
      kept = JSON.parse(aFixtureRun('keeps-its-picture', A_FILE_THAT_TAKES_A_PICTURE, named))
    }, 300_000)

    afterAll(() => {
      for (const folder of [...FIXTURE_FOLDERS, named, taken.one, taken.two, skipped]) {
        if (folder !== '') rmSync(folder, { recursive: true, force: true })
      }
    })

    it('answers a fresh folder under the system temporary folder, never the handback folder', () => {
      expect(taken.one.startsWith(tmpdir() + sep), `${taken.one} is not under ${tmpdir()}`).toBe(true)
      expect(taken.one, 'two calls shared one folder').not.toBe(taken.two)
      expect(taken.one.includes('handback-shots'), `${taken.one} is the handback folder`).toBe(false)
    })



    it('with TEST_SHOTS set, keeps the named folder and the picture in it', () => {
      expect(kept.where).toBe(join(named, 'keeps-its-picture'))
      expect(existsSync(kept.picture), `${kept.picture} was deleted, though TEST_SHOTS named its folder`).toBe(true)
    })
  })


  it('no test file names the handback folder in a string', () => {
    // IN A STRING, because two tests of the file door mention the folder in their comments, as the
    // place the owner's pictures are. A path a test writes to is a string; a comment writes nothing.
    const inAString = /(['"])[^'"\n]*handback-shots[^'"\n]*\1/
    const naming = readdirSync(join(ROOT, 'tests'), { recursive: true, encoding: 'utf8' })
      .filter((name) => /\.(ts|mts|mjs|js)$/.test(name) && name !== 'no-test-writes-into-the-owners-home.test.ts')
      .filter((name) => inAString.test(readFileSync(join(ROOT, 'tests', name), 'utf8')))
    expect(naming, 'these test files name the handback folder in a string').toEqual([])
  })
})


/**
 * THE TEST FILES THAT STILL NAME A FIXED PATH INSIDE `.logs/`, and why each one does.
 *
 * Two kinds. Some read or write a place the product itself uses in this checkout, so the path is
 * the product's and not the test's choice. The rest were found by this case on 1 October 2026 and
 * are not in problem x25LcNeJ7RFi's list of nine, so they were named here until they were moved; the last of
 * them, forest-map-persistence, moved to a folder of its own on 3 October 2026 (problem h09tYuNl1nd9). A new
 * file turns this case red until somebody moves its path or writes down why it stays.
 */
const FILES_THAT_NAME_A_FIXED_LOGS_PATH: Readonly<Record<string, string>> = {
  'tests/a-refused-registration-does-not-leave-a-world-running.test.ts':
    'tools/isolated-mole-office.mjs puts each world in .logs/isolated/, and the test checks that a refused registration leaves nothing there.',
  'tests/an-isolated-office-starts-on-a-full-size-copy.test.ts':
    'tools/isolated-mole-office.mjs puts each world in .logs/isolated/, and the test checks that a failed start leaves no copy there.',
  'tests/serving-a-backup.test.ts':
    'tools/isolated-mole-office.mjs puts each world in .logs/isolated/, and the test reads the world it started there.',
  'tests/a-world-is-reachable-from-where-the-person-reads-the-office.test.ts':
    'It reads where.json, which tools/isolated-mole-office.mjs writes in .logs/isolated/<name>/.',
  'tests/a-world-says-what-it-is-for.test.ts':
    'It reads where.json, which tools/isolated-mole-office.mjs writes in .logs/isolated/<name>/.',
  'tests/a-cleanup-asks-the-ledger-first.test.ts':
    "tools/isolated-mole-office.mjs stops only a world in .logs/isolated/<name>/, so the test puts its world's where.json there and checks the stop deletes the folder or leaves it.",
  'tests/the-ledgers-holding-answer-is-read-in-one-place.test.ts':
    "tools/isolated-mole-office.mjs stops only a world in .logs/isolated/<name>/, so the test puts its world's where.json there, checks that a refused stop leaves it, and removes the folder after each case.",
  'tests/a-session-the-hook-filed-is-held-by-its-agent.test.ts':
    'The session hook keeps its note for a conversation in .logs/session-<id>.json of the checkout it runs from, and the test reads that note and removes it.',
  'tests/the-hook-files-for-nobody-under-a-name-no-agent-can-take.test.ts':
    'The session hook keeps its note for a conversation in .logs/session-<id>.json of the checkout it runs from, and the test reads that note and removes it.',
  'tests/the-hook-names-the-agent-from-its-start-folder.test.ts':
    'The session hook keeps its note for a conversation in .logs/session-<id>.json of the checkout it runs from, and the test reads that note.',
  'tests/the-hook-says-where-you-are.test.ts':
    'The session hook keeps its note for a conversation in .logs/session-<id>.json of the checkout it runs from, and the test writes the note the hook will read.',
  'tests/a-session-started-inside-another-is-its-child.test.ts':
    'The session hook keeps its note for a conversation in .logs/session-<id>.json of the checkout it runs from, and the test reads the note the hook wrote and removes each one after its case.',
  'tests/a-stamp-the-hook-writes-carries-its-resume-command.test.ts':
    'The session hook keeps its note for a conversation in .logs/session-<id>.json of the checkout it runs from, and the test removes the note the hook wrote after each case.',
  'tests/a-run-the-environment-names-is-stamped-at-its-first-stop.test.ts':
    'The session hook keeps its note for a conversation in .logs/session-<id>.json of the checkout it runs from, and the test removes the note the hook wrote after each case.',
  'tests/an-agent-in-a-held-pane-is-found-resumed-and-reached.test.ts':
    'The session hook keeps its note for a conversation in .logs/session-<id>.json of the checkout it runs from, and the test removes the note the hook wrote for the conversation it opened in the pane.',
  'tests/a-failed-worker-start-closes-the-row-it-filed.test.ts':
    "A server started from a checkout writes the message worker's log in .logs/the-message-worker-<port>.log of that checkout, and the test makes a folder at that path for a free port of its own, so that the worker's start fails, and removes it after.",
  'tests/the-trunk-is-read-from-the-repository.test.ts':
    "'.logs/worker.log' is a file path inside a sealed submission of a clone the test made for itself, not a path on this checkout's disk.",
  'tests/cloud-box-commands.mjs':
    "The made-up npm writes the startup journals a whole run leaves in .logs/ of the made-up box's clone, a temporary folder of the test's own, where the real suite leaves them for the cloud runner to keep.",
  'tests/the-cloud-suite-door-runs-the-commit.test.ts':
    "The index of the startup journals the cloud runner kept names each by its path in the made-up box's clone, '.logs/setup-waits-<sha256>-<pid>.jsonl', and the test compares those names; nothing is read or written in this checkout's .logs folder.",
  'tests/the-merge-queue-keeps-the-startup-journals.test.ts':
    "The index the made-up door hands back names each startup journal by its path in the box's clone, '.logs/setup-waits-<sha256>-<pid>.jsonl', as tools/cloud-suite-journals.mjs writes it. The index is written in the test's own temporary folder; nothing is read or written in this checkout's .logs folder.",
}






describe('nothing can be collected without the guard', () => {
  it('names the setup file in vitest.config.ts', () => {
    const config = readFileSync(join(ROOT, 'vitest.config.ts'), 'utf8')
    expect(config).toContain(`./${THE_SETUP_FILE}`)
    expect(existsSync(join(ROOT, THE_SETUP_FILE))).toBe(true)
  })

  it('no test file puts the old home back', () => {
    // Several files move HOME themselves and restore what they found. What they find is now the
    // directory the setup file made, so restoring it is safe. A file that assigned the value this
    // helper hands back, or wrote a home path out in full, would be undoing the setup file.
    const offenders = everyTestFile()
      .filter(({ source }) =>
        /process\.env\.HOME\s*=\s*(theHomeBeforeTheTests\(\)|['"`]\/)/.test(source),
      )
      .map(({ path }) => path)
    expect(offenders, `these put HOME back at a home the setup file moved away from: ${offenders.join(', ')}`).toEqual([])
  })

  it('names every test file that replaces node:fs for itself, because the guard is its module', () => {
    const replacing = everyTestFile()
      .filter(({ source }) => /vi\.mock\(\s*['"]node:fs(\/promises)?['"]/.test(source))
      .map(({ path }) => path)
    // The walk has to find the one that is there, or an empty result would pass as a clean one.
    expect(replacing.length, 'the walk found no file mocking node:fs, so it found nothing at all').toBeGreaterThan(0)
    expect(replacing.filter((path) => FILES_THAT_REPLACE_NODE_FS[path] === undefined)).toEqual([])
  })
})
