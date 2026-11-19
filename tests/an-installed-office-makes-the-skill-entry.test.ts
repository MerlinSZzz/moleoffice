// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN INSTALLED OFFICE MAKES THE SKILL ENTRY. Wave 13t, round W16, item 2.
 *
 * The entry press (src/config/install-the-entry.mjs) links `~/.claude/skills/mole-office` to the office's skill. Until
 * this round it refused every installed office, because an installed folder has no .git, and a folder with no .git was
 * taken to be a copy. A copy is still refused, in the same words (problem hlNgNPM9hGTh). Now the press asks the
 * installer about a folder that has a build stamp and no .git (src/config/systems/the-installer-of-a-folder.mjs). It
 * does not look at the folder's name or its path:
 *
 *   - on Linux, the .deb's office is a folder whose build stamp dpkg's file list names;
 *   - on Windows, the Windows package's office is a folder that an entry in this user's Installed apps holds as
 *     resources\office in its InstallLocation;
 *   - on Linux, a folder inside APPDIR while APPIMAGE is set is in the AppImage's own folder: a mount at a new path each
 *     time it starts, or a temporary folder it unpacked itself to. Round W16 refused it. Since round W19 the press links the skill to a copy the office keeps in
 *     its own data folder (tests/an-appimage-links-the-skill-to-a-copy-it-keeps.test.ts);
 *   - when dpkg or PowerShell cannot be asked, the press refuses in words that name what it could not ask.
 *
 * Since round W21 the press of a .deb's or a Windows package's office makes the skill link and writes the three hook
 * lines. Each line runs the session hook the office carries, for-agents/session-hook.mjs, with the Node the office
 * carries, both by whole paths, because a person who installed the office may have no Node of their own. Since round
 * W23 an AppImage's office writes the three lines too. Its hook is in the AppImage's folder, and a later start can run
 * in another folder, so each of its lines runs a launcher in its data folder with /bin/sh, and the launcher runs the
 * hook with the Node (tests/an-appimage-links-the-skill-to-a-copy-it-keeps.test.ts). Each case runs in a made-up
 * home and a made-up installed folder. dpkg-query is a stand-in on PATH and PowerShell is a stand-in runner; neither is
 * the real program. Only a run on a Windows computer can show the real list of installed apps, and only a run of Claude
 * Code can show what it does with a hook line.
 *
 *   1-4: the .deb. 1: the press makes the skill link and writes the three hook lines after the person's own, keeps
 *        every other line and a backup of the file, and says what each line runs; each line runs the office's Node and
 *        hook by whole paths, and runs as it is written with no Node on PATH; dpkg was asked about the build stamp.
 *        2: a second press writes nothing. 3: after the folder
 *        is replaced at the same path, as an upgrade replaces it, the link still reaches the skill and a press writes
 *        nothing. 4: a copy of the installed folder somewhere else is refused in today's words for a copy.
 *   5-6: dpkg cannot answer. 5: there is no dpkg-query on PATH. 6: dpkg-query ends with an error. Each is refused in
 *        words that name dpkg, and nothing is written.
 *   7: a folder with no build stamp and no .git is refused as a copy, and dpkg is not asked.
 *   8-9: the AppImage. 8: a folder inside APPDIR gets the skill link to the copy in the office's data folder, and dpkg
 *        is not asked (round W19). The three hook lines run the launcher in that data folder with /bin/sh, after the
 *        person's own, and each runs as it is written with no Node on PATH: the launcher runs the office's Node and
 *        hook (round W23). 9: with APPIMAGE set, a folder outside APPDIR is asked of dpkg as before.
 *   10-13: Windows. 10: the script reads this user's Uninstall key and each entry's InstallLocation. 11: an entry whose
 *        InstallLocation holds the folder as resources\office makes the link and the three hook lines, whatever the
 *        case of its letters, and a second press writes nothing. Each line runs runtime\node.exe. 12: entries for other folders do not, and the folder is refused as a copy.
 *        13: PowerShell that did not run, ended with an error, or did not finish the list is a question that could not
 *        be asked, and the press refuses in words.
 *   14: on the Mac nothing is asked, and the press refuses in words that say so.
 *   15: the Windows build and the question name the office's folder inside the installed folder from one place.
 *   16: the .deb (round W18, and its words since round W21). The press says the link and the three hook
 *       lines stay when the package is removed, and why: the package is removed for the whole computer, and its
 *       removal changes nothing in anyone's home. With the folder removed the link leads nowhere and a hook line fails,
 *       and with the folder back at its path both work again.
 *   17: Windows (round W18). The first press's words are the whole reply, and say nothing of what becomes of
 *       the link or the hook lines when the app is uninstalled.
 *   18-19: an installed office whose built hook (18) or whose Node (19) is not there is refused in words, and nothing
 *       is written.
 *   20: the .deb (round W24). A later press that changes the file keeps its own copy at `-2`, the first backup stays
 *       byte for byte, and the press's words name both. 20b: a press that changes only the skill link leaves the
 *       settings file and its backup as they were and makes no copy, and its words say so, which office this is, and
 *       what the package's removal leaves.
 *   21: Windows. The line names the install's own node.exe as the program, and the hook and the mode as its
 *       arguments, so a path with a space is one argument and no shell reads it.
 *   22: Windows. A press over the older line replaces it with the install's own node.exe as the program and the
 *       hook and the mode as its arguments, in the older line's place, and backs the file up first.
 *
 * MUTATIONS (wave 13t, round W23), run from 03:37 to 03:38 on 3 November 2026 (UTC), each after a control run that
 * passed, and each restored. The earlier rounds' are in the commit messages that added their code. Each red, case 8:
 *   - the AppImage's three lines run the hook with the office's Node, as before this round, not the launcher;
 *   - the lines run the launcher with /bin/bash.
 *
 * MUTATIONS (wave 13t, round W24), run from 05:16 to 05:22 on 3 November 2026 (UTC), each after a control run that
 * passed, and each restored, with the press's change in the worktree and not yet committed.
 *   - the copy is made over whatever is at the first name: red, case 20;
 *   - a later press's words name its own copy and not the first: red, case 20;
 *   - outside an AppImage, a press with no line to add writes the file and a backup again: red, case 20b;
 *   - the press that changes only the link does not say that the settings file was not changed: red, case 20b;
 *   - the same press does not say which office this is: red, case 20b;
 *   - the same press does not say what the package's removal leaves: red, case 20b.
 *
 * MUTATIONS (18 November 2026), run from 17:56 to 18:01 (UTC), each after a control run that passed, and each
 * restored, with the work committed and `git diff --stat` empty after the restore.
 *   - the Windows line goes back to its one quoted string: red, cases 11 and 21;
 *   - a line written now is no longer found by its arguments: red, case 11.
 *
 * MUTATIONS (18 November 2026, second run), each after a control run that passed, and each restored, with
 * `git diff --stat` empty after the restore.
 *   - the older line is kept: red, case 22;
 *   - the new line is put at the end of the list instead of in the older line's place: red, case 22;
 *   - the press's words do not say the older line was replaced: red, case 22.
 *   The mutant that replaces a line that is not exactly the older line, and the mutant that gives Linux the
 *   replacement, left case 22 green.
 */

import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ENTRY_HOOK_TIMEOUT_SECONDS, installTheEntry } from '../src/config/install-the-entry.mjs'
import { theShippedNodeIn } from '../src/config/settings.mjs'
import { theSystemFor } from '../src/config/systems/the-system.mjs'
import {
  THE_OFFICE_IN_THE_INSTALLED_FOLDER,
  theScriptThatListsTheInstalledApps,
  windowsInstallerQuestion,
} from '../src/config/systems/the-installer-of-a-folder.mjs'
import { theInstallerFacts } from '../scripts/the-windows-build.mjs'

type WhatACommandDid = import('../src/config/process-reader.mjs').WhatACommandDid

let scratch: string
let home: string
let standIns: string
let asked: string

const skillLink = (): string => join(home, '.claude', 'skills', 'mole-office')
const settingsPath = (): string => join(home, '.claude', 'settings.json')
const skillOf = (office: string): string => join(office, '.claude', 'skills', 'mole-office')
const stampOf = (office: string): string => join(office, 'build-stamp.json')
/** The session hook an installed office carries, built (scripts/bundle.mjs). */
const hookOf = (office: string): string => join(office, 'for-agents', 'session-hook.mjs')
/** The Node an installed office carries, where it is on each system. */
const nodeOf = (office: string, platform: 'linux' | 'win32' = 'linux'): string => join(office, ...theShippedNodeIn(platform))
/**
 * What a Linux office's hook line starts with. A Linux installation carries no Node: its hook runs on the program the
 * office runs on, told to run as Node. Here that program is the Node running this test, which reads nothing in the variable.
 */
const THE_LINUX_LINES_NODE = `ELECTRON_RUN_AS_NODE=1 ${JSON.stringify(process.execPath)}`

/** The machine's own PATH without any folder that holds a node, read before each case puts a made-up one in its place. */
const THE_MACHINES_PATH_WITH_NO_NODE = String(process.env['PATH']).split(':').filter((folder) => folder !== '' && !existsSync(join(folder, 'node'))).join(':')

/** A settings file the person already has. The press must leave it exactly as it is. */
const THE_PERSONS_SETTINGS = `${JSON.stringify({ hooks: { SessionStart: [{ matcher: '', hooks: [{ type: 'command', command: 'echo another tool' }] }] }, theme: 'dark' }, null, 2)}\n`

/**
 * A made-up installed office: the skill, the build stamp, the built session hook and the Node an installed folder
 * carries, and no .git. On Windows its Node is a link to the Node running this test, and its hook prints the word it was run with,
 * so a hook line the press writes can be run as it is written.
 * @param root the folder the installer installs into; the office is resources/office in it
 * @param platform the system the installer is for, which says where the office keeps its Node
 */
function anInstalledOffice(root: string, platform: 'linux' | 'win32' = 'linux'): string {
  const office = join(root, ...THE_OFFICE_IN_THE_INSTALLED_FOLDER)
  mkdirSync(skillOf(office), { recursive: true })
  writeFileSync(join(skillOf(office), 'SKILL.md'), '# the skill, made up for this test\n', 'utf8')
  writeFileSync(stampOf(office), `${JSON.stringify({ version: '0.0.0-made-up', builtAt: '2026-11-01T00:00:00.000Z' })}\n`, 'utf8')
  mkdirSync(dirname(hookOf(office)), { recursive: true })
  writeFileSync(hookOf(office), "process.stdout.write(`the made-up hook ran with ${process.argv.slice(2).join(' ')}`)\n", 'utf8')
  if (platform !== 'linux') {
    mkdirSync(dirname(nodeOf(office, platform)), { recursive: true })
    symlinkSync(process.execPath, nodeOf(office, platform))
  }
  return office
}

/** One hook line as the press writes it for an installed office: its Node and its hook, each by its whole path. */
const theInstalledLine = (office: string, mode: 'start' | 'stop' | 'end', platform: 'linux' | 'win32' = 'linux'): unknown => ({
  matcher: '',
  hooks: [{
    type: 'command',
    ...(platform === 'win32'
      ? { command: nodeOf(office, platform), args: [hookOf(office), mode] }
      : { command: `${THE_LINUX_LINES_NODE} ${JSON.stringify(hookOf(office))} ${mode}` }),
    timeout: ENTRY_HOOK_TIMEOUT_SECONDS,
  }],
})

/** The line the press wrote for an installed office before Windows lines named their program and their arguments. */
const theOlderInstalledGroup = (office: string, mode: 'start' | 'stop' | 'end', platform: 'linux' | 'win32'): unknown => ({
  matcher: '',
  hooks: [{
    type: 'command',
    command: `${platform === 'win32' ? JSON.stringify(nodeOf(office, platform)) : THE_LINUX_LINES_NODE} ${JSON.stringify(hookOf(office))} ${mode}`,
    timeout: ENTRY_HOOK_TIMEOUT_SECONDS,
  }],
})

/** The person's own settings with the three lines of an installed office after their own. */
const theSettingsWithTheLines = (office: string, platform: 'linux' | 'win32' = 'linux'): unknown => {
  const persons = JSON.parse(THE_PERSONS_SETTINGS) as { hooks: { SessionStart: unknown[] }; theme: string }
  return {
    hooks: {
      SessionStart: [...persons.hooks.SessionStart, theInstalledLine(office, 'start', platform)],
      Stop: [theInstalledLine(office, 'stop', platform)],
      SessionEnd: [theInstalledLine(office, 'end', platform)],
    },
    theme: persons.theme,
  }
}

/** The command of the hook line the settings file holds at `event`, the last in its list. */
function theLineAt(event: 'SessionStart' | 'Stop' | 'SessionEnd'): string {
  const settings = JSON.parse(readFileSync(settingsPath(), 'utf8')) as { hooks: Record<string, { hooks: { command: string }[] }[]> }
  const command = settings.hooks[event]?.at(-1)?.hooks[0]?.command
  if (command === undefined) throw new Error(`The settings file holds no hook line at ${event}.`)
  return command
}

/** A hook line run through sh as it is written, with nothing on PATH but the stand-ins, so no Node of the person's. */
const theLineRun = (command: string): { status: number | null; stdout: string; stderr: string } =>
  spawnSync('/bin/sh', ['-c', command], { encoding: 'utf8', env: { PATH: standIns } })

/**
 * A stand-in dpkg-query on PATH, which writes each question into `asked`. It names the package for each file in `owns`
 * and ends with 0; for any other file it ends with 1, as dpkg-query does when no package holds the file. With `fails`
 * it ends with 2, as dpkg-query does on an error. It uses only the shell's own commands, because PATH holds nothing
 * else.
 */
function aStandInDpkg(answers: { owns?: readonly string[]; fails?: true }): void {
  const lines = ['#!/bin/sh', `printf '%s\\n' "$*" >> '${asked}'`]
  if (answers.fails === true) {
    lines.push(`printf '%s\\n' 'dpkg-query: error: the test made this fail' >&2`, 'exit 2')
  } else {
    lines.push('case "$2" in')
    for (const file of answers.owns ?? []) lines.push(`  '${file}') printf '%s\\n' 'mole-office: ${file}'; exit 0 ;;`)
    lines.push('esac', `printf '%s\\n' "dpkg-query: no path found matching pattern $2" >&2`, 'exit 1')
  }
  writeFileSync(join(standIns, 'dpkg-query'), `${lines.join('\n')}\n`, { encoding: 'utf8', mode: 0o755 })
}

/** What the stand-in dpkg-query was asked, one line per question. */
const whatDpkgWasAsked = (): string[] => (existsSync(asked) ? readFileSync(asked, 'utf8').split('\n').filter((line) => line !== '') : [])

/** Today's words for a copy, from the press as it was before this round. */
const theCopysWords = (folder: string): string =>
  `This folder is not a checkout git keeps: ${folder}. There is no .git in it, so it is a copy somebody ` +
  'made — with git archive, with tar, or with cp — and a copy is thrown away when the work that made it is ' +
  'done. The hook line would then run a file that is no longer there, at the start of every session on this ' +
  "machine. Nothing was written. Run this in the office's own checkout, the one git made and keeps."

/** Nothing of the entry was written: no link, and the settings file as the person had it. */
function nothingWasWritten(): void {
  expect(existsSync(skillLink()) || lstatExists(skillLink()), 'the skill link was made').toBe(false)
  expect(readFileSync(settingsPath(), 'utf8')).toBe(THE_PERSONS_SETTINGS)
  expect(existsSync(`${settingsPath()}.mole-office-backup`), 'the settings file was backed up').toBe(false)
}

function lstatExists(path: string): boolean {
  try {
    lstatSync(path)
    return true
  } catch {
    return false
  }
}

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'w16-installed-entry-'))
  home = join(scratch, 'home')
  standIns = join(scratch, 'stand-ins')
  asked = join(scratch, 'what-dpkg-was-asked.txt')
  mkdirSync(join(home, '.claude'), { recursive: true })
  mkdirSync(standIns)
  writeFileSync(settingsPath(), THE_PERSONS_SETTINGS, 'utf8')
  vi.stubEnv('PATH', standIns)
  vi.stubEnv('APPIMAGE', '')
  vi.stubEnv('APPDIR', '')
  // The AppImage's copy goes in the data folder, so every case has a made-up one (round W19).
  vi.stubEnv('XDG_CONFIG_HOME', join(scratch, 'config'))
})

afterEach(() => {
  vi.unstubAllEnvs()
  rmSync(scratch, { recursive: true, force: true })
})

describe('the .deb: dpkg names the build stamp', () => {
  it("1: the press makes the skill link and writes the three hook lines, which run the office's Node and hook as written", async () => {
    const office = anInstalledOffice(join(scratch, 'opt', 'mole-office'))
    aStandInDpkg({ owns: [stampOf(office)] })

    const made = await installTheEntry({ home, checkout: office, system: theSystemFor('linux') })
    expect(made.ok, made.says).toBe(true)
    if (!made.ok) return
    expect(made).toMatchObject({
      changed: true, createdSkillLink: true, replacedSkillLink: false,
      addedSessionStart: true, addedStop: true, addedSessionEnd: true, backupPath: `${settingsPath()}.mole-office-backup`,
      skillLink: skillLink(), skillSource: skillOf(office),
    })
    expect(readlinkSync(skillLink())).toBe(skillOf(office))
    expect(JSON.parse(readFileSync(settingsPath(), 'utf8'))).toEqual(theSettingsWithTheLines(office))
    expect(readFileSync(`${settingsPath()}.mole-office-backup`, 'utf8')).toBe(THE_PERSONS_SETTINGS)
    expect(made.says).toContain(
      `Wrote one hook line at SessionStart, one hook line at Stop, one hook line at SessionEnd, the skill link ${skillLink()} ` +
        `into ${settingsPath()}, linking it to ${skillOf(office)}. This office is the one the package mole-office installed. ` +
        `Each hook line runs the session hook this office carries, ${hookOf(office)}, with this app's own program, run as Node, ` +
        `${process.execPath}. The file it replaced is backed up at ${settingsPath()}.mole-office-backup. Every other line in ` +
        'that file was left as it was.',
    )
    expect(made.says).not.toContain('no session hook yet')
    expect(whatDpkgWasAsked()).toEqual([`-S ${stampOf(office)}`])

    // Each line, run as it is written with no Node on PATH, runs the office's hook with the office's Node.
    expect(theLineRun('command -v node').status, 'a Node is on PATH').not.toBe(0)
    for (const [event, mode] of [['SessionStart', 'start'], ['Stop', 'stop'], ['SessionEnd', 'end']] as const) {
      const ran = theLineRun(theLineAt(event))
      expect(ran.status, ran.stderr).toBe(0)
      expect(ran.stdout).toBe(`the made-up hook ran with ${mode}`)
    }
  })

  it('2: a second press writes nothing and says so', async () => {
    const office = anInstalledOffice(join(scratch, 'opt', 'mole-office'))
    aStandInDpkg({ owns: [stampOf(office)] })
    expect((await installTheEntry({ home, checkout: office, system: theSystemFor('linux') })).ok).toBe(true)

    const written = readFileSync(settingsPath(), 'utf8')
    const again = await installTheEntry({ home, checkout: office, system: theSystemFor('linux') })
    expect(again).toMatchObject({
      ok: true, changed: false, createdSkillLink: false, replacedSkillLink: false,
      addedSessionStart: false, addedStop: false, addedSessionEnd: false, backupPath: null,
    })
    expect(again.says).toBe(
      'The Mole Office entry is already in place: the skill link points at this installed office and all three hook ' +
        'lines are in the settings file. Nothing was written.',
    )
    expect(readFileSync(settingsPath(), 'utf8')).toBe(written)
  })

  it('3: after the folder is replaced at the same path, as an upgrade replaces it, the link still reaches the skill', async () => {
    const root = join(scratch, 'opt', 'mole-office')
    const office = anInstalledOffice(root)
    aStandInDpkg({ owns: [stampOf(office)] })
    expect((await installTheEntry({ home, checkout: office, system: theSystemFor('linux') })).ok).toBe(true)

    rmSync(root, { recursive: true })
    expect(existsSync(join(skillLink(), 'SKILL.md'))).toBe(false)
    expect(anInstalledOffice(root)).toBe(office)
    expect(existsSync(join(skillLink(), 'SKILL.md')), 'the link does not reach the upgraded skill').toBe(true)
    const again = await installTheEntry({ home, checkout: office, system: theSystemFor('linux') })
    expect(again).toMatchObject({ ok: true, changed: false })
  })

  it("4: a copy of the installed folder somewhere else is refused in today's words for a copy", async () => {
    const office = anInstalledOffice(join(scratch, 'opt', 'mole-office'))
    const copy = anInstalledOffice(join(scratch, 'a-copy'))
    aStandInDpkg({ owns: [stampOf(office)] })

    const refused = await installTheEntry({ home, checkout: copy, system: theSystemFor('linux') })
    expect(refused.ok).toBe(false)
    expect(refused.says).toBe(theCopysWords(copy))
    expect(whatDpkgWasAsked()).toEqual([`-S ${stampOf(copy)}`])
    nothingWasWritten()
  })
})

describe('the .deb: when the package is removed', () => {
  it('16: the press says the link and the hook lines stay, and fail, and why; both work again once the folder is back', async () => {
    const root = join(scratch, 'opt', 'mole-office')
    const office = anInstalledOffice(root)
    aStandInDpkg({ owns: [stampOf(office)] })

    const made = await installTheEntry({ home, checkout: office, system: theSystemFor('linux') })
    expect(made.ok, made.says).toBe(true)
    expect(made.says.endsWith(
      'If the package mole-office is removed, this link and the three hook lines stay. The package is removed for the ' +
        "whole computer, and its removal changes nothing in anyone's home folder, where they are. The link then leads " +
        'nowhere, and each hook line runs a program that is no longer there, so it fails at the start of every session, ' +
        'at the end of every turn and at the end of every session. Delete the link and the three lines then, or install ' +
        'the package again and they work again.',
    ), made.says).toBe(true)
    const line = theLineAt('SessionStart')

    // What the sentence says, with the folder removed as dpkg removes it and put back as an install puts it back.
    rmSync(root, { recursive: true })
    expect(lstatExists(skillLink()), 'the link was removed with the folder').toBe(true)
    expect(existsSync(join(skillLink(), 'SKILL.md')), 'the link leads somewhere').toBe(false)
    expect(theLineAt('SessionStart'), 'the hook line was removed with the folder').toBe(line)
    expect(theLineRun(line).status, 'the hook line still runs').not.toBe(0)
    anInstalledOffice(root)
    expect(existsSync(join(skillLink(), 'SKILL.md')), 'the link does not lead to the skill again').toBe(true)
    expect(theLineRun(line).stdout, 'the hook line does not run the hook again').toBe('the made-up hook ran with start')
    expect(await installTheEntry({ home, checkout: office, system: theSystemFor('linux') })).toMatchObject({ ok: true, changed: false })
  })
})

describe('the .deb: the first backup is never written over', () => {
  it('20: a later press that changes the file keeps its own copy, the first backup stays as it was, and the words name both', async () => {
    const office = anInstalledOffice(join(scratch, 'opt', 'mole-office'))
    aStandInDpkg({ owns: [stampOf(office)] })
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

  it('20b: a press that changes only the skill link leaves the settings file and its backup as they were, and says so', async () => {
    const office = anInstalledOffice(join(scratch, 'opt', 'mole-office'))
    aStandInDpkg({ owns: [stampOf(office)] })
    expect((await installTheEntry({ home, checkout: office, system: theSystemFor('linux') })).ok).toBe(true)
    const written = readFileSync(settingsPath(), 'utf8')
    const elsewhere = join(scratch, 'elsewhere')
    mkdirSync(elsewhere)
    rmSync(skillLink())
    symlinkSync(elsewhere, skillLink())

    const relinked = await installTheEntry({ home, checkout: office, system: theSystemFor('linux') })
    expect(relinked).toMatchObject({ ok: true, changed: true, replacedSkillLink: true, addedSessionStart: false, backupPath: null })
    expect(readlinkSync(skillLink())).toBe(skillOf(office))
    expect(readFileSync(settingsPath(), 'utf8'), 'a press with no line to add wrote the settings file').toBe(written)
    expect(readFileSync(`${settingsPath()}.mole-office-backup`, 'utf8'), 'a press with no line to add wrote over the first backup').toBe(THE_PERSONS_SETTINGS)
    expect(existsSync(`${settingsPath()}.mole-office-backup-2`), 'a press with no line to add made a copy').toBe(false)
    expect(relinked.says).toBe(
      `Wrote the skill link ${skillLink()}, which pointed somewhere else, linking it to ${skillOf(office)}. This office ` +
        `is the one the package mole-office installed. The three hook lines in ${settingsPath()} already run ` +
        `${hookOf(office)}, so that file was not changed. If the package mole-office is removed, this link and the three ` +
        "hook lines stay. The package is removed for the whole computer, and its removal changes nothing in anyone's " +
        'home folder, where they are. The link then leads nowhere, and each hook line runs a program that is no longer ' +
        'there, so it fails at the start of every session, at the end of every turn and at the end of every session. ' +
        'Delete the link and the three lines then, or install the package again and they work again.',
    )
  })
})

describe('dpkg cannot answer', () => {
  it('5: with no dpkg-query on PATH, the press refuses in words that name dpkg, and writes nothing', async () => {
    const office = anInstalledOffice(join(scratch, 'opt', 'mole-office'))
    const refused = await installTheEntry({ home, checkout: office, system: theSystemFor('linux') })
    expect(refused.ok).toBe(false)
    expect(refused.says).toContain(`Mole Office could not ask dpkg whether it installed this folder: ${office}`)
    expect(refused.says).toContain('dpkg-query')
    expect(refused.says).toContain('ENOENT')
    expect(refused.says).toContain('Nothing was written.')
    expect(refused.says).not.toContain('not a checkout git keeps')
    nothingWasWritten()
  })

  it('6: when dpkg-query ends with an error, the press refuses in words that give the error, and writes nothing', async () => {
    const office = anInstalledOffice(join(scratch, 'opt', 'mole-office'))
    aStandInDpkg({ fails: true })
    const refused = await installTheEntry({ home, checkout: office, system: theSystemFor('linux') })
    expect(refused.ok).toBe(false)
    expect(refused.says).toContain(`Mole Office could not ask dpkg whether it installed this folder: ${office}`)
    expect(refused.says).toContain('dpkg-query: error: the test made this fail')
    expect(refused.says).toContain('Nothing was written.')
    nothingWasWritten()
  })
})

describe('a folder with no build stamp', () => {
  it('7: is refused as a copy, and dpkg is not asked', async () => {
    const copy = anInstalledOffice(join(scratch, 'a-copy'))
    rmSync(stampOf(copy))
    aStandInDpkg({ owns: [stampOf(copy)] })
    const refused = await installTheEntry({ home, checkout: copy, system: theSystemFor('linux') })
    expect(refused.says).toBe(theCopysWords(copy))
    expect(whatDpkgWasAsked()).toEqual([])
    nothingWasWritten()
  })
})

describe('the AppImage', () => {
  it("8: a folder inside APPDIR gets the skill link to the copy in the office's data folder and three hook lines that run the launcher there, and dpkg is not asked", async () => {
    const mount = join(scratch, 'tmp', '.mount_MoleOfAb12Cd')
    const office = anInstalledOffice(mount)
    // The AppImage's own folder is readable by all and writable by its user alone, whatever this shell's umask.
    chmodSync(mount, 0o755)
    aStandInDpkg({ owns: [stampOf(office)] })
    vi.stubEnv('APPIMAGE', join(scratch, 'Downloads', 'Mole-Office.AppImage'))
    vi.stubEnv('APPDIR', mount)

    const made = await installTheEntry({ home, checkout: office, system: theSystemFor('linux') })
    expect(made.ok, made.says).toBe(true)
    expect(readlinkSync(skillLink())).toBe(join(scratch, 'config', 'mole-office', 'skills', 'mole-office'))
    expect(made.says).toContain(`This office runs from an AppImage, in the folder ${mount}. That folder is the AppImage's, not the office's`)
    expect(made.says).not.toContain('Install the .deb')
    const launcher = join(scratch, 'config', 'mole-office', 'session-hook', 'run')
    expect(made.says).toContain(`Wrote the hook launcher at ${launcher}, which runs ${hookOf(office)} with ${process.execPath}.`)
    expect(made.says).toContain(
      `Wrote one hook line at SessionStart, one hook line at Stop, one hook line at SessionEnd into ${settingsPath()}, ` +
        `each running that launcher with /bin/sh. The file it replaced is backed up at ${settingsPath()}.mole-office-backup.`,
    )
    expect(made).toMatchObject({ addedSessionStart: true, addedStop: true, addedSessionEnd: true, backupPath: `${settingsPath()}.mole-office-backup` })
    expect(whatDpkgWasAsked()).toEqual([])

    // THE LINES COME AFTER THE PERSON'S OWN, and the file the press replaced is kept whole.
    const theLauncherLine = (mode: 'start' | 'stop' | 'end'): unknown => ({
      matcher: '',
      hooks: [{ type: 'command', command: `"/bin/sh" "${launcher}" ${mode}`, timeout: ENTRY_HOOK_TIMEOUT_SECONDS }],
    })
    const persons = JSON.parse(THE_PERSONS_SETTINGS) as { hooks: { SessionStart: unknown[] }; theme: string }
    expect(JSON.parse(readFileSync(settingsPath(), 'utf8'))).toEqual({
      hooks: {
        SessionStart: [...persons.hooks.SessionStart, theLauncherLine('start')],
        Stop: [theLauncherLine('stop')],
        SessionEnd: [theLauncherLine('end')],
      },
      theme: persons.theme,
    })
    expect(readFileSync(`${settingsPath()}.mole-office-backup`, 'utf8')).toBe(THE_PERSONS_SETTINGS)

    // EACH LINE RUNS AS IT IS WRITTEN, with no node on PATH: the launcher runs the office's Node with its hook.
    for (const [event, mode] of [['SessionStart', 'start'], ['Stop', 'stop'], ['SessionEnd', 'end']] as const) {
      const ran = spawnSync('/bin/sh', ['-c', theLineAt(event)], { encoding: 'utf8', env: { PATH: THE_MACHINES_PATH_WITH_NO_NODE } })
      expect(ran.status, `${mode}: ${ran.stderr}`).toBe(0)
      expect(ran.stdout, mode).toBe(`the made-up hook ran with ${mode}`)
    }
  })

  it('9: with APPIMAGE set, a folder outside APPDIR is asked of dpkg as before', async () => {
    const office = anInstalledOffice(join(scratch, 'opt', 'mole-office'))
    aStandInDpkg({ owns: [stampOf(office)] })
    vi.stubEnv('APPIMAGE', join(scratch, 'Downloads', 'Mole-Office.AppImage'))
    vi.stubEnv('APPDIR', join(scratch, 'tmp', '.mount_MoleOfAb12Cd'))

    const made = await installTheEntry({ home, checkout: office, system: theSystemFor('linux') })
    expect(made.ok, made.says).toBe(true)
    expect(whatDpkgWasAsked()).toEqual([`-S ${stampOf(office)}`])
  })
})

/** A stand-in for PowerShell that keeps each script and gives one answer to all of them. */
function aStandInPowerShell(answer: WhatACommandDid): { scripts: string[]; commands: import('../src/config/systems/windows-commands.mjs').WindowsCommands } {
  const scripts: string[] = []
  return {
    scripts,
    commands: {
      powershell: () => {
        throw new Error('the question of which installer made a folder holds the thread while PowerShell runs')
      },
      startPowerShell: async (script) => {
        scripts.push(script)
        return answer
      },
    },
  }
}

/** What the script prints for these entries of Installed apps, as it prints them on Windows. */
const theListPrinted = (entries: readonly (readonly [string, string])[]): string =>
  `${[...entries.map(([name, at]) => `entry\t${name}\t${at}`), 'listed'].join('\r\n')}\r\n`

const POWERSHELL = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'

describe('Windows: an entry in Installed apps holds the folder', () => {
  it("10: the script reads this user's Uninstall key and each entry's InstallLocation, and stops on an error", () => {
    const script = theScriptThatListsTheInstalledApps()
    expect(script).toContain("$ErrorActionPreference = 'Stop'")
    expect(script).toContain("'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall'")
    expect(script).toContain("GetValue('InstallLocation')")
    expect(script).toContain("'listed'")
    expect(script).toContain('exit 1')
    expect(script).not.toMatch(/Set-Item|New-Item|Remove-Item|Set-ItemProperty/)
  })

  it('11: an entry whose InstallLocation holds the folder as resources\\office makes the link and the hook lines, and a second press writes nothing', async () => {
    const root = join(scratch, 'Programs', 'Mole Office')
    const office = anInstalledOffice(root, 'win32')
    const powershell = aStandInPowerShell({
      command: POWERSHELL, ran: true, status: 0, stderr: '',
      stdout: theListPrinted([['Another App', join(scratch, 'Programs', 'Another App')], ['a1b2c3-mole-office', root.toUpperCase()]]),
    })
    const system = { platform: 'win32', aFolderIsLinkedBy: 'a-junction', anInstallerMade: windowsInstallerQuestion(powershell.commands) } as const

    const made = await installTheEntry({ home, checkout: office, system })
    expect(made.ok, made.says).toBe(true)
    expect(made).toMatchObject({ changed: true, createdSkillLink: true, addedSessionStart: true, addedStop: true, addedSessionEnd: true })
    expect(readlinkSync(skillLink())).toBe(skillOf(office))
    expect(made.says).toContain('which Windows lists in Installed apps as a1b2c3-mole-office')
    expect(JSON.parse(readFileSync(settingsPath(), 'utf8'))).toEqual(theSettingsWithTheLines(office, 'win32'))
    expect(nodeOf(office, 'win32')).toBe(join(office, 'runtime', 'node.exe'))
    expect(powershell.scripts).toEqual([theScriptThatListsTheInstalledApps()])

    const again = await installTheEntry({ home, checkout: office, system })
    expect(again).toMatchObject({ ok: true, changed: false })
    expect(again.says).toContain('Nothing was written.')
  })

  it('12: entries for other folders do not hold it, and the folder is refused as a copy', async () => {
    const root = join(scratch, 'Programs', 'Mole Office')
    const office = anInstalledOffice(root, 'win32')
    const powershell = aStandInPowerShell({
      command: POWERSHELL, ran: true, status: 0, stderr: '',
      stdout: theListPrinted([['the parent', join(root, 'resources')], ['the folder itself', office], ['another', join(scratch, 'Programs', 'Mole Office 2')]]),
    })
    const system = { platform: 'win32', aFolderIsLinkedBy: 'a-junction', anInstallerMade: windowsInstallerQuestion(powershell.commands) } as const

    const refused = await installTheEntry({ home, checkout: office, system })
    expect(refused.says).toBe(theCopysWords(office))
    nothingWasWritten()
  })

  it('13: PowerShell that did not run, ended with an error, or did not finish the list is refused in words', async () => {
    const office = anInstalledOffice(join(scratch, 'Programs', 'Mole Office'), 'win32')
    const answers: [WhatACommandDid, string][] = [
      [{ command: POWERSHELL, ran: false, reason: `${POWERSHELL} could not be run: spawnSync ENOENT` }, 'could not be run: spawnSync ENOENT'],
      [{ command: POWERSHELL, ran: true, status: 1, stdout: '', stderr: 'Requested registry access is not allowed.\r\n' }, 'Requested registry access is not allowed.'],
      [{ command: POWERSHELL, ran: true, status: 0, stdout: theListPrinted([['a1b2c3-mole-office', 'C:\\x']]).replace('listed\r\n', ''), stderr: '' }, 'did not finish the list'],
    ]
    for (const [answer, reason] of answers) {
      const powershell = aStandInPowerShell(answer)
      const system = { platform: 'win32', aFolderIsLinkedBy: 'a-junction', anInstallerMade: windowsInstallerQuestion(powershell.commands) } as const
      const refused = await installTheEntry({ home, checkout: office, system })
      expect(refused.ok).toBe(false)
      expect(refused.says).toContain(`Mole Office could not ask Windows's list of installed apps whether it installed this folder: ${office}`)
      expect(refused.says).toContain(reason)
      expect(refused.says).toContain('Nothing was written.')
      nothingWasWritten()
    }
  })

  it("21: the line names the install's own node.exe as the program, with the hook and the mode as its arguments", async () => {
    const root = join(scratch, 'Programs', 'Mole Office')
    const office = anInstalledOffice(root, 'win32')
    const powershell = aStandInPowerShell({
      command: POWERSHELL, ran: true, status: 0, stderr: '',
      stdout: theListPrinted([['a1b2c3-mole-office', root]]),
    })
    const system = { platform: 'win32', aFolderIsLinkedBy: 'a-junction', anInstallerMade: windowsInstallerQuestion(powershell.commands) } as const

    const made = await installTheEntry({ home, checkout: office, system })
    expect(made.ok, made.says).toBe(true)
    const settings = JSON.parse(readFileSync(settingsPath(), 'utf8')) as {
      hooks: Record<string, { hooks: { type: string, command: string, args?: string[], timeout: number }[] }[]>
    }
    for (const [event, mode] of [['SessionStart', 'start'], ['Stop', 'stop'], ['SessionEnd', 'end']] as const) {
      const line = settings.hooks[event]?.at(-1)?.hooks[0]
      expect(line).toEqual({
        type: 'command',
        command: nodeOf(office, 'win32'),
        args: [hookOf(office), mode],
        timeout: ENTRY_HOOK_TIMEOUT_SECONDS,
      })
    }
    expect(nodeOf(office, 'win32')).toBe(join(office, 'runtime', 'node.exe'))
    expect(nodeOf(office, 'win32').endsWith('.cmd')).toBe(false)
    expect(settings.hooks['SessionStart']?.at(-1)?.hooks[0]?.command).not.toBe('node')
    expect(root).toContain(' ')
    expect(settings.hooks['SessionStart']?.at(-1)?.hooks[0]?.args).toEqual([hookOf(office), 'start'])
  })

  it("22: a Windows press replaces the older line with the install's own node.exe and the hook as its arguments, in its place, and backs the file up first", async () => {
    const root = join(scratch, 'Programs', 'Mole Office')
    const office = anInstalledOffice(root, 'win32')
    const powershell = aStandInPowerShell({
      command: POWERSHELL, ran: true, status: 0, stderr: '',
      stdout: theListPrinted([['a1b2c3-mole-office', root]]),
    })
    const system = { platform: 'win32', aFolderIsLinkedBy: 'a-junction', anInstallerMade: windowsInstallerQuestion(powershell.commands) } as const
    const theirHook = { type: 'command', command: 'echo their own hook' }
    const theExecLine = (mode: 'start' | 'stop' | 'end'): unknown => ({
      type: 'command',
      command: nodeOf(office, 'win32'),
      args: [hookOf(office), mode],
      timeout: ENTRY_HOOK_TIMEOUT_SECONDS,
    })
    const theSettings = {
      hooks: {
        SessionStart: [{ matcher: '', hooks: [(theOlderInstalledGroup(office, 'start', 'win32') as { hooks: unknown[] }).hooks[0], theirHook] }],
        Stop: [theOlderInstalledGroup(office, 'stop', 'win32')],
        SessionEnd: [theOlderInstalledGroup(office, 'end', 'win32')],
      },
      theme: 'dark',
    }
    const before = `${JSON.stringify(theSettings, null, 2)}\n`
    mkdirSync(join(home, '.claude'), { recursive: true })
    writeFileSync(settingsPath(), before, 'utf8')

    const made = await installTheEntry({ home, checkout: office, system })
    expect(made.ok, made.says).toBe(true)
    expect(made).toMatchObject({
      changed: true, createdSkillLink: true,
      addedSessionStart: false, addedStop: false, addedSessionEnd: false,
      backupPath: `${settingsPath()}.mole-office-backup`,
    })
    expect(made.says).toContain('The older Windows hook lines at SessionStart, Stop and SessionEnd were replaced')
    expect(readFileSync(`${settingsPath()}.mole-office-backup`, 'utf8')).toBe(before)
    expect(JSON.parse(readFileSync(settingsPath(), 'utf8'))).toEqual({
      hooks: {
        SessionStart: [{ matcher: '', hooks: [theExecLine('start'), theirHook] }],
        Stop: [{ matcher: '', hooks: [theExecLine('stop')] }],
        SessionEnd: [{ matcher: '', hooks: [theExecLine('end')] }],
      },
      theme: 'dark',
    })
  })

  it("17: the first press's words are the whole reply, and say nothing of an uninstall", async () => {
    const root = join(scratch, 'Programs', 'Mole Office')
    const office = anInstalledOffice(root, 'win32')
    const powershell = aStandInPowerShell({
      command: POWERSHELL, ran: true, status: 0, stderr: '',
      stdout: theListPrinted([['a1b2c3-mole-office', root]]),
    })
    const system = { platform: 'win32', aFolderIsLinkedBy: 'a-junction', anInstallerMade: windowsInstallerQuestion(powershell.commands) } as const

    const made = await installTheEntry({ home, checkout: office, system })
    expect(made.ok, made.says).toBe(true)
    expect(made.says).toBe(
      `Wrote one hook line at SessionStart, one hook line at Stop, one hook line at SessionEnd, the skill link ${skillLink()} ` +
        `into ${settingsPath()}, linking it to ${skillOf(office)}. This office is in the folder which Windows lists in ` +
        'Installed apps as a1b2c3-mole-office. Each hook line runs the session hook this office carries, ' +
        `${hookOf(office)}, with the Node this office carries, ${nodeOf(office, 'win32')}. The file it replaced is backed ` +
        `up at ${settingsPath()}.mole-office-backup. Every other line in that file was left as it was.`,
    )
  })
})

describe('an installed office without what its hook lines run', () => {
  it('18: with no built hook in it, the press refuses in words, and writes nothing', async () => {
    const office = anInstalledOffice(join(scratch, 'opt', 'mole-office'))
    rmSync(hookOf(office))
    aStandInDpkg({ owns: [stampOf(office)] })
    const refused = await installTheEntry({ home, checkout: office, system: theSystemFor('linux') })
    expect(refused.ok).toBe(false)
    expect(refused.says).toBe(`The hook these three lines would run is not in this installed office: ${hookOf(office)}. Nothing was written.`)
    nothingWasWritten()
  })

  it('19: with no Node in it, the press refuses in words, and writes nothing', async () => {
    const root = join(scratch, 'Programs', 'Mole Office')
    const office = anInstalledOffice(root, 'win32')
    rmSync(nodeOf(office, 'win32'))
    const powershell = aStandInPowerShell({ command: POWERSHELL, ran: true, status: 0, stderr: '', stdout: theListPrinted([['a1b2c3-mole-office', root]]) })
    const system = { platform: 'win32', aFolderIsLinkedBy: 'a-junction', anInstallerMade: windowsInstallerQuestion(powershell.commands) } as const
    const refused = await installTheEntry({ home, checkout: office, system })
    expect(refused.ok).toBe(false)
    expect(refused.says).toBe(
      `The Node these three lines would run the hook with is not in this installed office: ${nodeOf(office, 'win32')}. Nothing was written.`,
    )
    nothingWasWritten()
  })
})

describe('the Mac', () => {
  it('14: nothing is asked, and the press refuses in words that say so', async () => {
    const office = anInstalledOffice(join(scratch, 'Applications', 'Mole Office.app', 'Contents'))
    const refused = await installTheEntry({ home, checkout: office, system: theSystemFor('darwin') })
    expect(refused.ok).toBe(false)
    expect(refused.says).toContain(`Mole Office could not ask the Mac whether it installed this folder: ${office}`)
    expect(refused.says).toContain('Nothing was written.')
    expect(whatDpkgWasAsked()).toEqual([])
    nothingWasWritten()
  })
})

describe('one place names the office inside the installed folder', () => {
  it("15: the Windows build's THE_OFFICE is the folder the question reads", () => {
    expect(THE_OFFICE_IN_THE_INSTALLED_FOLDER).toEqual(['resources', 'office'])
    expect(theInstallerFacts()['THE_OFFICE']).toBe(THE_OFFICE_IN_THE_INSTALLED_FOLDER.join('\\'))
  })
})
