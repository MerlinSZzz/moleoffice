// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN APPIMAGE'S OFFICE LINKS THE SKILL TO A COPY IT KEEPS. Wave 13t, round W19, item 2.
 *
 * An AppImage runs its office in a folder that is the AppImage's, not the office's, and a later start can run in
 * another one. With FUSE, each start mounts the AppImage at a new folder. With APPIMAGE_EXTRACT_AND_RUN, the AppImage
 * is unpacked to a temporary folder named after the file's MD5, so a new version is unpacked to another one. So a skill
 * link into that folder would not follow the office. Round W16 refused the entry press in an AppImage for that reason.
 * The decision instead was that an AppImage's office keeps a copy of its skill in its own data folder, written again
 * from the running office at every start and at every press of the entry, and that `~/.claude/skills/mole-office` links
 * to that copy. The .deb and the Windows package keep linking to the installed skill. So the link stays a link, to a
 * copy the office keeps current. Round W20 ran the real AppImage both ways. Round W19's words called the folder a new
 * mount at every start, and that is true only with FUSE, so the office's words now say both (1, 1b, 5).
 *
 * ITS HOOK LINES RUN A LAUNCHER IT KEEPS (round W23). Until this round an AppImage's press wrote no hook line, because
 * the hook and its Node are in the AppImage's folder too. Now each of the three lines runs `session-hook/run` in the
 * office's data folder with /bin/sh, and that path does not change. The office writes the launcher again at every start
 * and at every press, naming the hook and the Node in the folder it runs in. The launcher runs them only while that
 * folder is a folder, not a link, owned by this user or by root, and not writable by its group or by others, because
 * after a stop another user can make a folder at its path. Otherwise it says one line at a session's start, nothing at a
 * stop or an end, and ends with 0.
 *
 *   1: a press in an AppImage writes the copy and the launcher in the office's data folder, links the skill to the copy,
 *      and writes three hook lines that run the launcher, after a backup of the settings file. It does not ask dpkg. Its
 *      answer is spelled out whole. It runs under a umask of 002, so the launcher's mode and its folder's are the
 *      press's own.
 *   1b: in a folder the AppImage was unpacked to, the press and the start do the same, and neither calls the folder a
 *      mount.
 *   2: the copy is the running office's skill byte for byte: the same files at the same paths, the same bytes, and
 *      nothing more. Each is a file, not a link.
 *   3: a second press writes the copy and the launcher again from the office as it is then, removes a file the skill no
 *      longer has, and leaves the link, the hook lines, the settings file and its backup as they were.
 *   3b: a later press that changes the file keeps its own copy at `-2`, the first backup stays byte for byte, and the
 *      press's words name both (round W24).
 *   4: after a stop the mount is gone and the link still leads to the copy. A new run at a new mount writes the copy
 *      again at its start, from the new mount, and the link leads to it with no press.
 *   5: a real server started with APPIMAGE set and APPDIR at its own folder writes the copy at its start, from its own
 *      skill, and the launcher, naming its own hook and Node, and says both. 5b: outside an AppImage the start writes
 *      nothing and says nothing.
 *   6: the .deb's press links to the installed skill as before, and writes no copy. Since round W21 that press writes
 *      the three hook lines too, so this office carries the built session hook and its Node.
 *   7: a copy that cannot be written is refused in words, and no link, no launcher and no hook line is written.
 *   7b: a launcher that cannot be written is refused in words, and no link and no hook line is written. A start says on
 *       its line that it could not write it. A new launcher that cannot be renamed into its place is not left behind.
 *   8: each hook line, run by /bin/sh as it is written and with no node on PATH, runs the launcher, and the launcher
 *      runs the office's Node with its hook, the mode word and Claude Code's payload, from a folder whose name holds a
 *      space and a single quote. The launcher runs the same under dash and under bash.
 *   8b: the launcher runs nothing from a folder that is a link, that its group or others can write in, or that stat
 *       says another user owns, nor when the Node or the hook is not there or the Node cannot be run. Each time it says
 *       the one line at a start and nothing at a stop or an end, and ends with 0. From a folder that stat says root
 *       owns, as a FUSE mount is owned, it runs the hook.
 *   9: after a stop the lines run nothing, and the start's line says so. A new run at a new mount writes the launcher
 *      again at its start, the settings file is not changed, and the lines run the new mount's hook with no press.
 *
 * Each case runs in a made-up home and a made-up data folder (XDG_CONFIG_HOME). dpkg-query is a stand-in on PATH. The
 * AppImage's folder is a made-up one, named as the AppImage's runtime names a mount or a folder it unpacked itself to.
 * Only a run of the real AppImage can show either. The office's Node is a stand-in shell script that prints what it was
 * run with; the hook it is given is never run. This sandbox has no second user and no root, so it cannot make a folder
 * another user owns, or one root owns that this user can fill: in 8b a stand-in stat on PATH answers for the folder's
 * owner, and only a run on a computer with a second user shows the real one. On Debian and Ubuntu /bin/sh is dash.
 *
 * ON LINUX THE OFFICE'S NODE IS THE APP'S OWN PROGRAM, beside resources/ in the AppImage's folder, told to run as Node by
 * ELECTRON_RUN_AS_NODE=1, which the launcher exports. So the stand-in Node is at that path, and while a case runs in the
 * AppImage this process's execPath names it, because the office names the program that runs it as its Node. The
 * stand-in prints that variable as well.
 *
 * MUTATIONS (wave 13t, round W23), run from 03:28 to 03:37 on 3 November 2026 (UTC), each after a control run that
 * passed, and each restored. Round W19's, and the earlier rounds', are in the commit messages that added their code.
 *   - the press's three lines run the hook with the office's Node, as before this round, not the launcher: red, cases
 *     1, 8b and 9;
 *   - the launcher does not refuse a link: it passed. On Linux, stat without -L gives a link's own mode, 777, so the
 *     mode check refuses a link as well. With stat also made to follow the link: red, case 8b;
 *   - the launcher's mode check masks no bit, so a folder its group or others can write in is safe: red, case 8b;
 *   - the launcher takes a folder whoever owns it: red, case 8b;
 *   - the launcher says its line at a stop and an end as well as at a start: red, cases 8b and 9;
 *   - the launcher ends with 1 when it runs nothing: red, cases 8b and 9;
 *   - the start writes the skill's copy and not the launcher: red, case 5;
 *   - a second press, with no line to add, writes the settings file and its backup again: red, case 3;
 *   - a new launcher that could not be renamed into its place is left behind: red, case 7b;
 *   - the launcher's folder is made with the umask's mode, not 700: red, case 1;
 *   - a launcher that could not be written does not refuse the press: red, case 7b;
 *   - a refusal no longer says that no hook line was written: red, cases 7 and 7b;
 *   - outside an AppImage the start goes on to write a launcher: red, case 5b;
 *   - the launcher names its folder unquoted: red, case 8;
 *   - the lines run the launcher with /bin/bash: red, case 1;
 *   - the launcher passes on no mode word: red, cases 8, 8b and 9;
 *   - the launcher does not ask whether the Node can be run: red, case 8b;
 *   - a press looks for the start's line by the hook's path, not the launcher's: red, case 3;
 *   - the launcher does not ask whether the hook is there: red, case 8b;
 *   - the start says it wrote the launcher and writes nothing: red, cases 5, 7b and 9;
 *   - the launcher is written with mode 777: red, case 1. With case 1's press under the test's own umask of 022, as
 *     before this round's umask criterion, it passed.
 *
 * MUTATIONS (wave 13t, round W24), run from 05:16 to 05:22 on 3 November 2026 (UTC), each after a control run that
 * passed, and each restored, with the press's change in the worktree and not yet committed.
 *   - the copy is made over whatever is at the first name: red, case 3b;
 *   - a later press's words name its own copy and not the first: red, case 3b.
 */

import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ENTRY_HOOK_TIMEOUT_SECONDS,
  installTheEntry,
  keepTheAppImagesHookLauncher,
  keepTheAppImagesSkillCopy,
  theAppImagesSkillCopy,
} from '../src/config/install-the-entry.mjs'
import { theSystemFor } from '../src/config/systems/the-system.mjs'
import { THE_OFFICE_IN_THE_INSTALLED_FOLDER } from '../src/config/systems/the-installer-of-a-folder.mjs'
import { REPO, aPlace, startAServer, stopEverything, stopTheServer } from './terminal-holder-stand.ts'

let scratch: string
let home: string
let config: string
let standIns: string
let asked: string

const skillLink = (): string => join(home, '.claude', 'skills', 'mole-office')
const settingsPath = (): string => join(home, '.claude', 'settings.json')
const skillOf = (office: string): string => join(office, '.claude', 'skills', 'mole-office')
const stampOf = (office: string): string => join(office, 'build-stamp.json')
/** Where the copy is, worked out here from the data folder the test names, not asked of the code under test. */
const theCopy = (): string => join(config, 'mole-office', 'skills', 'mole-office')
/** Where the hook launcher is, worked out the same way. */
const theLauncher = (): string => join(config, 'mole-office', 'session-hook', 'run')
/** The session hook an installed office carries, built (scripts/bundle.mjs). */
const hookOf = (office: string): string => join(office, 'for-agents', 'session-hook.mjs')
/** The office's Node on Linux: the app's own program, in the folder the office is installed in, beside resources/. */
const nodeOf = (office: string): string => join(office, ...THE_OFFICE_IN_THE_INSTALLED_FOLDER.map(() => '..'), 'mole-office')

/** The Node this process runs on, which a case in an AppImage replaces until it ends. */
const THIS_PROCESSS_NODE = process.execPath

/** The machine's own PATH, read before each case puts a made-up one in its place. A real server needs the real one. */
const THE_MACHINES_PATH = process.env['PATH'] ?? ''

/** The machine's own PATH without any folder that holds a node, as a person's shell may be. stat and id are on it. */
const THE_MACHINES_PATH_WITH_NO_NODE = THE_MACHINES_PATH.split(':').filter((folder) => folder !== '' && !existsSync(join(folder, 'node'))).join(':')

/** A settings file the person already has. A press keeps every line of it, and its backup holds it whole. */
const THE_PERSONS_SETTINGS = `${JSON.stringify({ theme: 'dark' }, null, 2)}\n`

/** What the launcher says at a session's start when it runs nothing, as the person reads it. */
const THE_LINE_WHEN_IT_RUNS_NOTHING =
  "MOLE OFFICE — the folder Mole Office's AppImage last ran from is gone or is not safe to run from, so this session is not on the record. Nothing else changes."

/** Claude Code's payload on a hook line's stdin, made up. */
const THE_PAYLOAD = JSON.stringify({ session_id: 'a-made-up-session', hook_event_name: 'SessionStart' })

/** The three hook events and the mode word each line passes. */
const THE_THREE_LINES = [['SessionStart', 'start'], ['Stop', 'stop'], ['SessionEnd', 'end']] as const

/** One hook line as an AppImage's press writes it: /bin/sh and the launcher, each by its whole path. */
const theLauncherLine = (mode: 'start' | 'stop' | 'end'): unknown => ({
  matcher: '',
  hooks: [{ type: 'command', command: `"/bin/sh" "${theLauncher()}" ${mode}`, timeout: ENTRY_HOOK_TIMEOUT_SECONDS }],
})

/** The person's own settings with the three lines after them. */
const theSettingsWithTheLines = (): unknown => ({
  theme: 'dark',
  hooks: { SessionStart: [theLauncherLine('start')], Stop: [theLauncherLine('stop')], SessionEnd: [theLauncherLine('end')] },
})

/** Every byte value once, so a copy that reads or writes text instead of bytes is caught. */
const EVERY_BYTE = Buffer.from(Array.from({ length: 256 }, (_, n) => n))

/**
 * A made-up office inside an AppImage's mount: a skill of three files, one of them in a folder of its own, the build
 * stamp an installed folder carries, and the built session hook and the Node; no .git. The mount is readable by all and
 * writable by this user alone, as the AppImage's own folder is, whatever this shell's umask.
 * @param mount the folder the AppImage runs in, a mount or a folder it unpacked itself to; the office is
 *   resources/office in it
 * @param version written into the skill, so two mounts' skills differ
 */
function anOfficeInAMount(mount: string, version: string): string {
  const office = join(mount, ...THE_OFFICE_IN_THE_INSTALLED_FOLDER)
  mkdirSync(join(skillOf(office), 'notes'), { recursive: true })
  chmodSync(mount, 0o755)
  writeFileSync(join(skillOf(office), 'SKILL.md'), `# the skill, made up for this test, ${version}\r\n技能，${version}\n`, 'utf8')
  writeFileSync(join(skillOf(office), 'reference.md'), `# the reference, ${version}\n`, 'utf8')
  writeFileSync(join(skillOf(office), 'notes', 'every-byte.bin'), EVERY_BYTE)
  writeFileSync(stampOf(office), `${JSON.stringify({ version, builtAt: '2026-11-02T00:00:00.000Z' })}\n`, 'utf8')
  theHookAndTheNodeIn(office)
  return office
}

/**
 * The built session hook and the Node that an installed office carries. Since round W21 the .deb's press writes three
 * hook lines that run them, and refuses an office without them; since round W23 so does an AppImage's, through its
 * launcher. Neither is run: this Node is an empty file that cannot be run (aNodeThatRuns gives one that can).
 * On Linux that Node is the app's own program, beside resources/ (`nodeOf`).
 * @param office
 */
function theHookAndTheNodeIn(office: string): void {
  mkdirSync(join(office, 'for-agents'), { recursive: true })
  writeFileSync(join(office, 'for-agents', 'session-hook.mjs'), '// a made-up session hook\n', 'utf8')
  writeFileSync(nodeOf(office), '', 'utf8')
}

/** Where the stand-in Node writes a line each time it runs, outside every mount, so a run that should not happen is seen. */
const theNodesNote = (): string => join(scratch, 'the-node-ran.txt')

/** How many times the stand-in Node has run. */
const timesTheNodeRan = (): number => (existsSync(theNodesNote()) ? readFileSync(theNodesNote(), 'utf8').split('\n').filter((line) => line !== '').length : 0)

/**
 * A stand-in for the office's Node that can be run: a shell script that prints its own path and each word it was run
 * with, one to a line in brackets, then what came on stdin, and writes a line into a note outside the mount. The
 * launcher runs it as it runs Node, so what it prints is what the launcher ran.
 * Between the words and stdin it prints ELECTRON_RUN_AS_NODE, which tells the app's own program to run as Node.
 * @param office
 */
function aNodeThatRuns(office: string): void {
  rmSync(nodeOf(office), { force: true })
  const script = [
    '#!/bin/sh',
    `for word in "$0" "$@"; do printf '[%s]\\n' "$word"; done`,
    `printf 'ELECTRON_RUN_AS_NODE: %s\\n' "\${ELECTRON_RUN_AS_NODE-not set}"`,
    `printf 'stdin: %s\\n' "$(cat)"`,
    `printf '%s\\n' ran >> '${theNodesNote()}'`,
    '',
  ].join('\n')
  writeFileSync(nodeOf(office), script, { encoding: 'utf8', mode: 0o755 })
}

/** What the stand-in Node prints when the launcher runs it for this office with this mode word. */
const whatTheNodePrints = (office: string, mode: string): string =>
  `[${nodeOf(office)}]\n[${hookOf(office)}]\n[${mode}]\nELECTRON_RUN_AS_NODE: 1\nstdin: ${THE_PAYLOAD}\n`

/** The command of the hook line the settings file holds at `event`, the last in its list. */
function theLineAt(event: 'SessionStart' | 'Stop' | 'SessionEnd'): string {
  const settings = JSON.parse(readFileSync(settingsPath(), 'utf8')) as { hooks: Record<string, { hooks: { command: string }[] }[]> }
  const command = settings.hooks[event]?.at(-1)?.hooks[0]?.command
  if (command === undefined) throw new Error(`The settings file holds no hook line at ${event}.`)
  return command
}

/**
 * A hook line run through /bin/sh as it is written, as Claude Code runs it, with Claude Code's payload on stdin and the
 * machine's PATH with no node on it, so no Node of the person's. `before` is put first on PATH, for a stand-in.
 */
const theLineRun = (command: string, before: readonly string[] = []): { status: number | null; stdout: string; stderr: string } =>
  spawnSync('/bin/sh', ['-c', command], {
    encoding: 'utf8',
    input: THE_PAYLOAD,
    env: { PATH: [...before, THE_MACHINES_PATH_WITH_NO_NODE].join(':'), HOME: home },
    timeout: 30_000,
  })

/** Each of the three lines, run as written, ran nothing: the one line at a start, nothing at a stop or an end, and 0. */
function theLinesRanNothing(why: string, before: readonly string[] = []): void {
  const ranBefore = timesTheNodeRan()
  for (const [event, mode] of THE_THREE_LINES) {
    const ran = theLineRun(theLineAt(event), before)
    expect(ran.status, `${why}, ${mode}: ${ran.stderr}`).toBe(0)
    expect(ran.stdout, `${why}, ${mode}`).toBe(mode === 'start' ? `${THE_LINE_WHEN_IT_RUNS_NOTHING}\n` : '')
    expect(ran.stderr, `${why}, ${mode}`).toBe('')
  }
  expect(timesTheNodeRan(), `${why}: the Node ran`).toBe(ranBefore)
}

/** Each of the three lines, run as written, ran this office's Node with its hook, the mode word and the payload. */
function theLinesRanTheHookOf(office: string, why: string, before: readonly string[] = []): void {
  for (const [event, mode] of THE_THREE_LINES) {
    const ran = theLineRun(theLineAt(event), before)
    expect(ran.status, `${why}, ${mode}: ${ran.stderr}`).toBe(0)
    expect(ran.stdout, `${why}, ${mode}`).toBe(whatTheNodePrints(office, mode))
    expect(ran.stderr, `${why}, ${mode}`).toBe('')
  }
}

/** A stand-in stat on PATH that answers this owner and mode for any file, as `stat -c '%u %a'` prints them. */
function aStandInStat(answers: string): string {
  const folder = join(scratch, `stat-answers-${answers.replaceAll(' ', '-')}`)
  mkdirSync(folder)
  writeFileSync(join(folder, 'stat'), `#!/bin/sh\nprintf '%s\\n' '${answers}'\n`, { encoding: 'utf8', mode: 0o755 })
  return folder
}

/** A made-up mount, named as an AppImage names the folder it mounts at. */
const aMount = (name: string): string => join(scratch, 'tmp', `.mount_MoleOf${name}`)

/** A made-up folder the AppImage unpacked itself to with APPIMAGE_EXTRACT_AND_RUN, named after the file's MD5. */
const anUnpackedFolder = (md5: string): string => join(scratch, 'tmp', `appimage_extracted_${md5}`)

/** Run inside an AppImage whose folder is `mount`, as its runtime sets the two names for what it starts. */
function inTheAppImage(mount: string): void {
  vi.stubEnv('APPIMAGE', join(scratch, 'Downloads', 'Mole-Office.AppImage'))
  vi.stubEnv('APPDIR', mount)
  // And on the app's own program in that folder, as the office there runs. The case's end gives back this process's own.
  process.execPath = nodeOf(join(mount, ...THE_OFFICE_IN_THE_INSTALLED_FOLDER))
}

/** Each file under `folder` by its path inside it, with its bytes as base64. A link or anything else is named as such. */
function theFilesIn(folder: string): Record<string, string> {
  const files: Record<string, string> = {}
  for (const entry of readdirSync(folder, { recursive: true, withFileTypes: true })) {
    const path = join(entry.parentPath, entry.name)
    const inside = relative(folder, path)
    if (entry.isDirectory()) continue
    files[inside] = entry.isFile() ? readFileSync(path).toString('base64') : `not a file: ${String(lstatSync(path).mode)}`
  }
  return files
}

/**
 * A stand-in dpkg-query on PATH, which writes each question into `asked`. It names the package for each file in `owns`
 * and ends with 0; for any other file it ends with 1, as dpkg-query does when no package holds the file.
 */
function aStandInDpkg(owns: readonly string[]): void {
  const lines = ['#!/bin/sh', `printf '%s\\n' "$*" >> '${asked}'`, 'case "$2" in']
  for (const file of owns) lines.push(`  '${file}') printf '%s\\n' 'mole-office: ${file}'; exit 0 ;;`)
  lines.push('esac', `printf '%s\\n' "dpkg-query: no path found matching pattern $2" >&2`, 'exit 1')
  writeFileSync(join(standIns, 'dpkg-query'), `${lines.join('\n')}\n`, { encoding: 'utf8', mode: 0o755 })
}

/** What the stand-in dpkg-query was asked, one line per question. */
const whatDpkgWasAsked = (): string[] => (existsSync(asked) ? readFileSync(asked, 'utf8').split('\n').filter((line) => line !== '') : [])

function lstatExists(path: string): boolean {
  try {
    lstatSync(path)
    return true
  } catch {
    return false
  }
}

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'w19-appimage-skill-'))
  home = join(scratch, 'home')
  config = join(scratch, 'config')
  standIns = join(scratch, 'stand-ins')
  asked = join(scratch, 'what-dpkg-was-asked.txt')
  mkdirSync(join(home, '.claude'), { recursive: true })
  mkdirSync(config)
  mkdirSync(standIns)
  writeFileSync(settingsPath(), THE_PERSONS_SETTINGS, 'utf8')
  vi.stubEnv('PATH', standIns)
  vi.stubEnv('HOME', home)
  vi.stubEnv('XDG_CONFIG_HOME', config)
  vi.stubEnv('APPIMAGE', '')
  vi.stubEnv('APPDIR', '')
  aStandInDpkg([])
})

afterEach(() => {
  vi.unstubAllEnvs()
  process.execPath = THIS_PROCESSS_NODE
  rmSync(scratch, { recursive: true, force: true })
})

afterAll(async () => {
  await stopEverything()
}, 60_000)

describe('a press in an AppImage', () => {
  it('1: writes the copy and the hook launcher in the data folder, links the skill to the copy, writes three hook lines that run the launcher, and says so', async () => {
    const mount = aMount('Ab12Cd')
    const office = anOfficeInAMount(mount, 'one')
    inTheAppImage(mount)

    expect(theAppImagesSkillCopy()).toBe(theCopy())
    // UNDER A UMASK THAT LEAVES THE GROUP ITS WRITE BIT, so the modes checked below are the ones the press gives.
    const umask = process.umask(0o002)
    let made: Awaited<ReturnType<typeof installTheEntry>>
    try {
      made = await installTheEntry({ home, checkout: office, system: theSystemFor('linux') })
    } finally {
      process.umask(umask)
    }
    expect(made.ok, made.says).toBe(true)
    if (!made.ok) return
    expect(made).toMatchObject({
      changed: true, createdSkillLink: true, replacedSkillLink: false,
      addedSessionStart: true, addedStop: true, addedSessionEnd: true, backupPath: `${settingsPath()}.mole-office-backup`,
      skillLink: skillLink(), skillSource: theCopy(),
    })
    expect(lstatSync(skillLink()).isSymbolicLink()).toBe(true)
    expect(readlinkSync(skillLink())).toBe(theCopy())
    expect(lstatSync(theCopy()).isDirectory()).toBe(true)
    expect(JSON.parse(readFileSync(settingsPath(), 'utf8'))).toEqual(theSettingsWithTheLines())
    expect(readFileSync(`${settingsPath()}.mole-office-backup`, 'utf8')).toBe(THE_PERSONS_SETTINGS)
    expect(whatDpkgWasAsked()).toEqual([])

    // THE LAUNCHER IS A FILE ONLY THIS USER CAN WRITE, in a folder only this user can read, and nothing else is there.
    expect(lstatSync(theLauncher()).isFile()).toBe(true)
    expect(lstatSync(theLauncher()).mode & 0o022, 'the launcher can be written by its group or by others').toBe(0)
    expect(statSync(dirname(theLauncher())).mode & 0o777).toBe(0o700)
    expect(readdirSync(dirname(theLauncher()))).toEqual(['run'])

    expect(made.says).toBe(
      `Wrote a copy of this office's skill at ${theCopy()}, from ${skillOf(office)}, and the skill link ${skillLink()}, ` +
        `linking it to that copy. Wrote the hook launcher at ${theLauncher()}, which runs ${hookOf(office)} with ` +
        `${nodeOf(office)}. Wrote one hook line at SessionStart, one hook line at Stop, one hook line at SessionEnd into ` +
        `${settingsPath()}, each running that launcher with /bin/sh. The file it replaced is backed up at ` +
        `${settingsPath()}.mole-office-backup. Every other line in that file was left as it was. This office runs from an ` +
        `AppImage, in the folder ${mount}. That folder is the AppImage's, not the office's, and a later start can run in ` +
        'another one. With FUSE, each start mounts the AppImage at a new folder. With APPIMAGE_EXTRACT_AND_RUN, the ' +
        'AppImage is unpacked to a temporary folder, and a new version is unpacked to another one. So the link leads to ' +
        "a copy in the office's own data folder, and the office writes the copy again from its own skill at every start " +
        'and at every press of this entry. The hook lines run the launcher, which is in the same data folder and is ' +
        'written again at the same moments. While the folder it names is gone, as it is after a stop, or is not safe to ' +
        "run from, the launcher says at a session's start that the session is not on the record.",
    )
  })

  it('1b: in a folder the AppImage was unpacked to, the press and the start do the same, and neither calls the folder a mount', async () => {
    const unpacked = anUnpackedFolder('b18b0c747d29be8164a33fa7cd40b6a1')
    const office = anOfficeInAMount(unpacked, 'one')
    inTheAppImage(unpacked)

    const made = await installTheEntry({ home, checkout: office, system: theSystemFor('linux') })
    expect(made.ok, made.says).toBe(true)
    if (!made.ok) return
    expect(made).toMatchObject({ changed: true, createdSkillLink: true, skillLink: skillLink(), skillSource: theCopy() })
    expect(readlinkSync(skillLink())).toBe(theCopy())
    expect(theFilesIn(skillLink())).toEqual(theFilesIn(skillOf(office)))
    expect(whatDpkgWasAsked()).toEqual([])
    expect(made.says).toContain(`This office runs from an AppImage, in the folder ${unpacked}.`)
    expect(made.says).not.toContain('mounted')

    const started = await keepTheAppImagesSkillCopy(office)
    expect(started).toEqual({
      written: true,
      line: `This office runs from an AppImage, in the folder ${unpacked}, so it wrote the copy of its skill again, from ${skillOf(office)}: ${theCopy()}.`,
    })
  })

  it('2: the copy is the running office\'s skill byte for byte, and nothing more', async () => {
    const mount = aMount('Ab12Cd')
    const office = anOfficeInAMount(mount, 'one')
    inTheAppImage(mount)

    const made = await installTheEntry({ home, checkout: office, system: theSystemFor('linux') })
    expect(made.ok, made.says).toBe(true)
    const theSkill = theFilesIn(skillOf(office))
    expect(Object.keys(theSkill).sort()).toEqual(['SKILL.md', join('notes', 'every-byte.bin'), 'reference.md'])
    expect(theFilesIn(theCopy())).toEqual(theSkill)
    expect(theFilesIn(skillLink())).toEqual(theSkill)
  })

  it('3: a second press writes the copy and the launcher again, and leaves the link, the hook lines and the backup as they were', async () => {
    const mount = aMount('Ab12Cd')
    const office = anOfficeInAMount(mount, 'one')
    inTheAppImage(mount)
    expect((await installTheEntry({ home, checkout: office, system: theSystemFor('linux') })).ok).toBe(true)
    const theFirstPressesSettings = readFileSync(settingsPath(), 'utf8')

    // The skill changes under the office, as a new version's would, and loses a file. The launcher is spoiled.
    writeFileSync(join(skillOf(office), 'SKILL.md'), '# the skill, changed\n', 'utf8')
    rmSync(join(skillOf(office), 'reference.md'))
    writeFileSync(theLauncher(), 'exit 3\n', 'utf8')
    const again = await installTheEntry({ home, checkout: office, system: theSystemFor('linux') })
    expect(again.ok, again.says).toBe(true)
    if (!again.ok) return
    expect(again).toMatchObject({
      changed: true, createdSkillLink: false, replacedSkillLink: false, skillSource: theCopy(),
      addedSessionStart: false, addedStop: false, addedSessionEnd: false, backupPath: null,
    })
    expect(readlinkSync(skillLink())).toBe(theCopy())
    expect(theFilesIn(theCopy())).toEqual(theFilesIn(skillOf(office)))
    expect(existsSync(join(theCopy(), 'reference.md')), 'a file the skill no longer has is still in the copy').toBe(false)
    expect(readFileSync(theLauncher(), 'utf8')).toContain(`hook='${hookOf(office)}'`)
    expect(again.says).toContain(`Wrote the copy of this office's skill again at ${theCopy()}, from ${skillOf(office)}`)
    expect(again.says).toContain(`The skill link ${skillLink()} already leads to that copy`)
    expect(again.says).toContain(`Wrote the hook launcher at ${theLauncher()}, which runs ${hookOf(office)} with ${nodeOf(office)}.`)
    expect(again.says).toContain(`The three hook lines in ${settingsPath()} already run that launcher, so that file was not changed.`)
    expect(readFileSync(settingsPath(), 'utf8')).toBe(theFirstPressesSettings)
    expect(readFileSync(`${settingsPath()}.mole-office-backup`, 'utf8')).toBe(THE_PERSONS_SETTINGS)
  })

  it('3b: a later press that changes the file keeps its own copy, the first backup stays as it was, and the words name both', async () => {
    const mount = aMount('Ab12Cd')
    const office = anOfficeInAMount(mount, 'one')
    inTheAppImage(mount)
    expect((await installTheEntry({ home, checkout: office, system: theSystemFor('linux') })).ok).toBe(true)

    // The person's file changes and loses the three lines, so the next press adds them again.
    const changed = THE_PERSONS_SETTINGS.replace('"dark"', '"light"')
    expect(changed).not.toBe(THE_PERSONS_SETTINGS)
    writeFileSync(settingsPath(), changed, 'utf8')
    const again = await installTheEntry({ home, checkout: office, system: theSystemFor('linux') })
    expect(again.ok, again.says).toBe(true)
    expect(again).toMatchObject({ changed: true, addedSessionStart: true, backupPath: `${settingsPath()}.mole-office-backup-2` })
    expect(readFileSync(`${settingsPath()}.mole-office-backup`, 'utf8'), 'a later press wrote over the first backup').toBe(THE_PERSONS_SETTINGS)
    expect(readFileSync(`${settingsPath()}.mole-office-backup-2`, 'utf8')).toBe(changed)
    expect(again.says).toContain(
      `The file it replaced is backed up at ${settingsPath()}.mole-office-backup-2. The first backup, at ` +
        `${settingsPath()}.mole-office-backup, was not changed. Every other line in that file was left as it was.`,
    )
  })
})

describe('a stop and a new run at a new mount', () => {
  it('4: the link still leads to the copy, and the new run\'s start writes it again from the new mount', async () => {
    const first = aMount('Ab12Cd')
    const officeOne = anOfficeInAMount(first, 'one')
    inTheAppImage(first)
    expect((await installTheEntry({ home, checkout: officeOne, system: theSystemFor('linux') })).ok).toBe(true)
    const theFirstSkill = theFilesIn(skillOf(officeOne))

    // The stop: the AppImage's runtime unmounts it, and its folder is gone.
    rmSync(first, { recursive: true, force: true })
    vi.stubEnv('APPIMAGE', '')
    vi.stubEnv('APPDIR', '')
    expect(readlinkSync(skillLink())).toBe(theCopy())
    expect(theFilesIn(skillLink())).toEqual(theFirstSkill)

    // The new run, at a new mount, with a newer skill. Its start writes the copy; nobody presses.
    const second = aMount('Ef34Gh')
    const officeTwo = anOfficeInAMount(second, 'two')
    inTheAppImage(second)
    const started = await keepTheAppImagesSkillCopy(officeTwo)
    expect(started).not.toBeNull()
    expect(started?.written, started?.line).toBe(true)
    expect(started?.line).toContain(second)
    expect(started?.line).toContain(theCopy())
    expect(readlinkSync(skillLink())).toBe(theCopy())
    expect(theFilesIn(skillLink())).toEqual(theFilesIn(skillOf(officeTwo)))
    expect(theFilesIn(skillLink())).not.toEqual(theFirstSkill)
  })
})

describe('a start', () => {
  it('5: a real server in an AppImage writes the copy from its own skill and its hook launcher at its start, and says both', async () => {
    const place = aPlace('w19ai')
    const server = await startAServer(place, undefined, { PATH: THE_MACHINES_PATH, APPIMAGE: join(place.dir, 'Mole-Office.AppImage'), APPDIR: REPO })
    try {
      const copy = join(place.config, 'mole-office', 'skills', 'mole-office')
      expect(existsSync(copy), server.output().slice(-3000)).toBe(true)
      expect(theFilesIn(copy)).toEqual(theFilesIn(skillOf(REPO)))
      expect(server.output()).toContain(`This office runs from an AppImage, in the folder ${REPO}, so it wrote the copy of its skill again`)
      expect(server.output()).toContain(copy)
      const launcher = join(place.config, 'mole-office', 'session-hook', 'run')
      expect(server.output()).toContain(
        `This office runs from an AppImage, in the folder ${REPO}, so it wrote its hook launcher again, to run ` +
          `${hookOf(REPO)} with ${THIS_PROCESSS_NODE}: ${launcher}.`,
      )
      expect(readFileSync(launcher, 'utf8')).toContain(`hook='${hookOf(REPO)}'`)
      expect(readFileSync(launcher, 'utf8'), 'the launcher does not tell the program it names to run as Node').toContain("export ELECTRON_RUN_AS_NODE='1'")
    } finally {
      await stopTheServer(server)
    }
  }, 120_000)

  it('5b: outside an AppImage the start writes nothing and says nothing', async () => {
    const office = anOfficeInAMount(aMount('Ab12Cd'), 'one')
    expect(await keepTheAppImagesSkillCopy(office)).toBeNull()
    expect(await keepTheAppImagesHookLauncher(office)).toBeNull()
    vi.stubEnv('APPIMAGE', join(scratch, 'Downloads', 'Mole-Office.AppImage'))
    vi.stubEnv('APPDIR', aMount('Zz99Zz'))
    expect(await keepTheAppImagesSkillCopy(office)).toBeNull()
    expect(await keepTheAppImagesHookLauncher(office)).toBeNull()
    expect(lstatExists(join(config, 'mole-office')), 'something was written in the data folder').toBe(false)
  })
})

describe('the .deb', () => {
  it('6: the press links to the installed skill as before, and writes no copy', async () => {
    const office = anOfficeInAMount(join(scratch, 'opt', 'mole-office'), 'one')
    theHookAndTheNodeIn(office)
    aStandInDpkg([stampOf(office)])

    const made = await installTheEntry({ home, checkout: office, system: theSystemFor('linux') })
    expect(made.ok, made.says).toBe(true)
    if (!made.ok) return
    expect(made).toMatchObject({ createdSkillLink: true, skillSource: skillOf(office) })
    expect(readlinkSync(skillLink())).toBe(skillOf(office))
    expect(whatDpkgWasAsked()).toEqual([`-S ${stampOf(office)}`])
    expect(lstatExists(join(config, 'mole-office')), 'something was written in the data folder').toBe(false)
    expect(made.says).not.toContain('copy')
  })
})

describe('a copy or a launcher that cannot be written', () => {
  it('7: a copy is refused in words, and no link, no launcher and no hook line is written', async () => {
    const mount = aMount('Ab12Cd')
    const office = anOfficeInAMount(mount, 'one')
    inTheAppImage(mount)
    // A file where the copy's folder would be made.
    mkdirSync(join(config, 'mole-office'))
    writeFileSync(join(config, 'mole-office', 'skills'), 'not a folder\n', 'utf8')

    const refused = await installTheEntry({ home, checkout: office, system: theSystemFor('linux') })
    expect(refused.ok).toBe(false)
    expect(refused.says).toContain(`The copy of this office's skill could not be written at ${theCopy()}`)
    expect(refused.says).toContain(`The skill link was not written. No hook line was written, and ${settingsPath()} was not changed.`)
    expect(lstatExists(skillLink()), 'the skill link was made').toBe(false)
    expect(lstatExists(theLauncher()), 'the launcher was written').toBe(false)
    expect(readFileSync(settingsPath(), 'utf8')).toBe(THE_PERSONS_SETTINGS)
    expect(existsSync(`${settingsPath()}.mole-office-backup`), 'the settings file was backed up').toBe(false)
  })

  it('7b: a launcher is refused in words, and no link and no hook line is written; a start says it could not write it', async () => {
    const mount = aMount('Ab12Cd')
    const office = anOfficeInAMount(mount, 'one')
    inTheAppImage(mount)
    // A file where the launcher's folder would be made.
    mkdirSync(join(config, 'mole-office'))
    writeFileSync(join(config, 'mole-office', 'session-hook'), 'not a folder\n', 'utf8')

    const refused = await installTheEntry({ home, checkout: office, system: theSystemFor('linux') })
    expect(refused.ok).toBe(false)
    expect(refused.says).toContain(
      `The copy of this office's skill was written again at ${theCopy()}, but its hook launcher could not be written at ${theLauncher()} (`,
    )
    expect(refused.says).toContain(`). The skill link was not written. No hook line was written, and ${settingsPath()} was not changed.`)
    expect(lstatExists(skillLink()), 'the skill link was made').toBe(false)
    expect(readFileSync(settingsPath(), 'utf8')).toBe(THE_PERSONS_SETTINGS)
    expect(existsSync(`${settingsPath()}.mole-office-backup`), 'the settings file was backed up').toBe(false)

    const started = await keepTheAppImagesHookLauncher(office)
    expect(started?.written).toBe(false)
    expect(started?.line).toContain(
      `This office runs from an AppImage, in the folder ${mount}, and its hook launcher could not be written again: ${theLauncher()} (`,
    )
    expect(started?.line).toContain('). Hook lines that run it run an older launcher, or nothing, until a start or a press of the entry writes it.')

    // A FOLDER WHERE THE LAUNCHER WOULD BE: the new file cannot be renamed into its place, and is not left beside it.
    rmSync(join(config, 'mole-office', 'session-hook'))
    mkdirSync(join(theLauncher(), 'something'), { recursive: true })
    const notRenamed = await keepTheAppImagesHookLauncher(office)
    expect(notRenamed?.written, notRenamed?.line).toBe(false)
    expect(readdirSync(dirname(theLauncher()))).toEqual(['run'])
  })
})

describe('the hook lines and the launcher', () => {
  it('8: each line runs the launcher, which runs the office\'s Node with its hook, the mode word and the payload', async () => {
    const mount = aMount("Ab 12'Cd")
    const office = anOfficeInAMount(mount, 'one')
    aNodeThatRuns(office)
    inTheAppImage(mount)
    const made = await installTheEntry({ home, checkout: office, system: theSystemFor('linux') })
    expect(made.ok, made.says).toBe(true)

    theLinesRanTheHookOf(office, 'a folder whose name holds a space and a single quote')
    expect(timesTheNodeRan()).toBe(3)

    // DASH IS /bin/sh ON DEBIAN AND UBUNTU, AND BASH IS ON OTHERS. The launcher runs the same under each.
    for (const shell of ['dash', 'bash']) {
      const ran = spawnSync(shell, [theLauncher(), 'start'], {
        encoding: 'utf8',
        input: THE_PAYLOAD,
        env: { PATH: THE_MACHINES_PATH_WITH_NO_NODE, HOME: home },
        timeout: 30_000,
      })
      expect(ran.error, shell).toBeUndefined()
      expect(ran.status, `${shell}: ${ran.stderr}`).toBe(0)
      expect(ran.stdout, shell).toBe(whatTheNodePrints(office, 'start'))
      expect(ran.stderr, shell).toBe('')
    }
  })

  it('8b: the launcher runs nothing from a folder that is not safe to run from, or without its Node or its hook, and says so only at a start', async () => {
    const mount = aMount('Ab12Cd')
    const office = anOfficeInAMount(mount, 'one')
    aNodeThatRuns(office)
    inTheAppImage(mount)
    const made = await installTheEntry({ home, checkout: office, system: theSystemFor('linux') })
    expect(made.ok, made.says).toBe(true)
    theLinesRanTheHookOf(office, 'the folder as the press found it')

    // A LINK AT THE FOLDER'S PATH, to a folder that holds the same office.
    renameSync(mount, `${mount}-elsewhere`)
    symlinkSync(`${mount}-elsewhere`, mount)
    theLinesRanNothing('a link at the folder\'s path')
    rmSync(mount)
    renameSync(`${mount}-elsewhere`, mount)

    // A FOLDER ITS GROUP OR OTHERS CAN WRITE IN.
    for (const mode of [0o775, 0o757, 0o777]) {
      chmodSync(mount, mode)
      theLinesRanNothing(`a folder of mode ${mode.toString(8)}`)
    }
    chmodSync(mount, 0o755)

    // A FOLDER ANOTHER USER OWNS, AS A STAND-IN STAT ANSWERS: this sandbox cannot make one. Root's is run from.
    theLinesRanNothing('a folder another user owns', [aStandInStat('4242 755')])
    theLinesRanNothing('a folder root owns that its group can write in', [aStandInStat('0 775')])
    theLinesRanTheHookOf(office, 'a folder root owns', [aStandInStat('0 755')])

    // NO NODE, A NODE THAT CANNOT BE RUN, AND NO HOOK.
    renameSync(nodeOf(office), `${nodeOf(office)}-elsewhere`)
    theLinesRanNothing('no Node')
    renameSync(`${nodeOf(office)}-elsewhere`, nodeOf(office))
    chmodSync(nodeOf(office), 0o644)
    theLinesRanNothing('a Node that cannot be run')
    chmodSync(nodeOf(office), 0o755)
    renameSync(hookOf(office), `${hookOf(office)}-elsewhere`)
    theLinesRanNothing('no hook')
    renameSync(`${hookOf(office)}-elsewhere`, hookOf(office))

    theLinesRanTheHookOf(office, 'the folder as the press found it, again')
  })
})

describe('a stop and a new run at a new mount, for the hook lines', () => {
  it('9: after a stop the lines run nothing and say so; the new run\'s start writes the launcher again, and the lines run its hook with no press', async () => {
    const first = aMount('Ab12Cd')
    const officeOne = anOfficeInAMount(first, 'one')
    aNodeThatRuns(officeOne)
    inTheAppImage(first)
    expect((await installTheEntry({ home, checkout: officeOne, system: theSystemFor('linux') })).ok).toBe(true)
    const theSettings = readFileSync(settingsPath(), 'utf8')
    theLinesRanTheHookOf(officeOne, 'the first run')

    // The stop: the AppImage's runtime unmounts it, and its folder is gone.
    rmSync(first, { recursive: true, force: true })
    vi.stubEnv('APPIMAGE', '')
    vi.stubEnv('APPDIR', '')
    theLinesRanNothing('after the stop')

    // The new run, at a new mount. Its start writes the launcher; nobody presses.
    const second = aMount('Ef34Gh')
    const officeTwo = anOfficeInAMount(second, 'two')
    aNodeThatRuns(officeTwo)
    inTheAppImage(second)
    expect(await keepTheAppImagesHookLauncher(officeTwo)).toEqual({
      written: true,
      line:
        `This office runs from an AppImage, in the folder ${second}, so it wrote its hook launcher again, to run ` +
        `${hookOf(officeTwo)} with ${nodeOf(officeTwo)}: ${theLauncher()}.`,
    })
    expect(readFileSync(settingsPath(), 'utf8')).toBe(theSettings)
    theLinesRanTheHookOf(officeTwo, 'the new run')
  })
})
