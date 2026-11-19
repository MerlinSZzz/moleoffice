// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SKILL ENTRY ON WINDOWS IS A DIRECTORY JUNCTION. Wave 13t, round W15, item 13.
 *
 * The entry press links `~/.claude/skills/mole-office` to the checkout's skill folder (src/config/install-the-entry.mjs).
 * On Linux and the Mac that is a symbolic link. Windows lets a user make a symbolic link only as an administrator or
 * in developer mode, so there it is a directory junction, which any user may make. The system layer says which
 * (src/config/systems/the-system.mjs), and the installer asks Node for a junction by the third argument of
 * `symlink`, from node:fs/promises. Since round W50 the press makes every file call by a promise, so that the server
 * answers other requests while it runs (tests/the-entrys-press-does-not-hold-the-servers-thread.test.ts).
 *
 * This file is read on Linux. Node ignores that third argument here and makes a symbolic link, so the cases read
 * what the installer asked Node for. Only a run on a Windows computer can show the junction itself.
 *
 *   1: Linux and the Mac link a folder by a symbolic link, and Windows by a junction.
 *   2: with Windows's system, a new link is asked for as a junction; a second press asks for nothing and says
 *      nothing was written.
 *   3: with Windows's system, a link that pointed at another folder is replaced by a junction.
 *   4: with Windows's system, a link put back after the settings file could not be written is a junction again.
 *   5: with Linux's system, and with this computer's when none is named, the link is asked for as before, with
 *      two arguments.
 *   6: a second press finds its own hook line when Windows spells the hook's path with backslashes. The settings file
 *      carries the command with the path as JSON spells it, each backslash doubled.
 *   7: on Windows a line names the program and its arguments, so a path with a space is one argument, and no shell
 *      reads it.
 *   8: a line in the form written before this change is replaced in its place, and the file is backed up first.
 *   9: Linux and the Mac still write the one shell string, unchanged.
 *  10: a Windows press over the older line at each event leaves exactly one line for the hook, in exec form, in the
 *      older line's place, with a person's own hook beside it and a group of the person's own unchanged.
 *  11: a line that names the hook but is not the older line is left as it is, and no line is added.
 *  12: a Linux and a Mac press over their own line replace nothing and write nothing.
 *
 * MUTATIONS (18 November 2026), run from 17:56 to 18:01 (UTC), each after a control run that passed, and each
 * restored, with the work committed and `git diff --stat` empty after the restore.
 *   - the Windows line goes back to its one quoted string: red, case 7;
 *   - a line written before the change is no longer found by its command: red, case 8;
 *   - Linux and the Mac get the Windows line too: red, case 9.
 *
 * MUTATIONS (18 November 2026, second run), each after a control run that passed, and each restored, with
 * `git diff --stat` empty after the restore.
 *   - the older line is kept: red, case 8;
 *   - the new line is put at the end of the list instead of in the older line's place: red, case 10;
 *   - a line that is not exactly the older line is replaced: red, case 11;
 *   - Linux gets the replacement too: red, case 12;
 *   - the press's words do not say the older line was replaced: red, case 8.
 */

import { existsSync, mkdtempSync, mkdirSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** Every call the installer makes to `symlink`, and a switch that makes the settings file's rename fail. */
const fs = vi.hoisted(() => ({ links: [] as unknown[][], failTheSettingsRename: false }))
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  const replaced = {
    ...actual,
    symlink: async (...args: Parameters<typeof actual.symlink>) => {
      fs.links.push(args)
      await actual.symlink(...args)
    },
    rename: async (from: string, to: string) => {
      if (fs.failTheSettingsRename && to.endsWith('settings.json')) throw new Error('the test made this rename fail')
      await actual.rename(from, to)
    },
  }
  return { ...replaced, default: replaced }
})

const { arrayAlreadyRuns, ENTRY_HOOK_TIMEOUT_SECONDS, installTheEntry, theEntryGroup } = await import('../src/config/install-the-entry.mjs')
const { theSystemFor } = await import('../src/config/systems/the-system.mjs')

const WINDOWS = { aFolderIsLinkedBy: 'a-junction' } as const
const LINUX = { aFolderIsLinkedBy: 'a-symbolic-link' } as const

let home: string
let checkout: string
let elsewhere: string
const skillLink = (): string => join(home, '.claude', 'skills', 'mole-office')
const skillSource = (): string => join(checkout, '.claude', 'skills', 'mole-office')

/** The line the office wrote for a hook before Windows lines named their program and their arguments. */
const theOlderHookLine = (hook: string, mode: 'start' | 'stop' | 'end'): { type: string; command: string; timeout: number } => ({
  type: 'command',
  command: `node ${JSON.stringify(hook)} ${mode}`,
  timeout: ENTRY_HOOK_TIMEOUT_SECONDS,
})

/** That older line in the group a settings file holds it in. */
const theOlderGroup = (hook: string, mode: 'start' | 'stop' | 'end'): unknown => ({
  matcher: '',
  hooks: [theOlderHookLine(hook, mode)],
})

/** The hook lines in these groups that name `hook`, counted from the file a press wrote. */
const theLinesNamingTheHook = (groups: unknown, hook: string): unknown[] => {
  if (!Array.isArray(groups)) return []
  return groups.flatMap((group) => {
    const hooks = (group as { hooks?: unknown }).hooks
    if (!Array.isArray(hooks)) return []
    return hooks.filter((line) => JSON.stringify(line).includes(JSON.stringify(hook)))
  })
}

/** A link to another folder, made by the test with `symlinkSync`, so it is not among the installer's calls. */
function aLinkToAnotherFolder(): void {
  mkdirSync(join(home, '.claude', 'skills'), { recursive: true })
  symlinkSync(elsewhere, skillLink())
}

/** A scratch home, another folder, and a checkout git keeps, with the skill and the hook the entry needs. */
beforeEach(() => {
  fs.links.length = 0
  fs.failTheSettingsRename = false
  home = mkdtempSync(join(tmpdir(), 'w15-entry-home-'))
  elsewhere = mkdtempSync(join(tmpdir(), 'w15-entry-elsewhere-'))
  checkout = mkdtempSync(join(tmpdir(), 'w15-entry-checkout-'))
  mkdirSync(join(checkout, '.git'))
  mkdirSync(skillSource(), { recursive: true })
  writeFileSync(join(skillSource(), 'SKILL.md'), '# a skill\n', 'utf8')
  mkdirSync(join(checkout, 'tools'), { recursive: true })
  writeFileSync(join(checkout, 'tools', 'session-hook.mjs'), '// the hook\n', 'utf8')
})

afterEach(() => {
  for (const folder of [home, elsewhere, checkout]) rmSync(folder, { recursive: true, force: true })
})

describe('which way each system links a folder', () => {
  it('1: Linux and the Mac by a symbolic link, and Windows by a junction', () => {
    expect(theSystemFor('linux').aFolderIsLinkedBy).toBe('a-symbolic-link')
    expect(theSystemFor('darwin').aFolderIsLinkedBy).toBe('a-symbolic-link')
    expect(theSystemFor('win32').aFolderIsLinkedBy).toBe('a-junction')
  })
})

describe("the skill entry with Windows's system", () => {
  it('2: a new link is asked for as a junction, and a second press asks for nothing and says nothing was written', async () => {
    const first = await installTheEntry({ home, checkout, system: WINDOWS })
    expect(first.ok, first.says).toBe(true)
    expect(fs.links).toEqual([[skillSource(), skillLink(), 'junction']])
    expect(readlinkSync(skillLink())).toBe(skillSource())

    const second = await installTheEntry({ home, checkout, system: WINDOWS })
    expect(second).toMatchObject({ ok: true, changed: false })
    expect(second.says).toContain('Nothing was written.')
    expect(fs.links).toHaveLength(1)
  })

  it('3: a link that pointed at another folder is replaced by a junction', async () => {
    aLinkToAnotherFolder()
    const replaced = await installTheEntry({ home, checkout, system: WINDOWS })
    expect(replaced).toMatchObject({ ok: true, replacedSkillLink: true })
    expect(fs.links).toEqual([[skillSource(), skillLink(), 'junction']])
    expect(readlinkSync(skillLink())).toBe(skillSource())
  })

  it('4: a link put back after the settings file could not be written is a junction again', async () => {
    aLinkToAnotherFolder()
    fs.failTheSettingsRename = true
    const refused = await installTheEntry({ home, checkout, system: WINDOWS })
    expect(refused.ok).toBe(false)
    expect(refused.says).toContain('the test made this rename fail')
    expect(fs.links).toEqual([
      [skillSource(), skillLink(), 'junction'],
      [elsewhere, skillLink(), 'junction'],
    ])
    expect(readlinkSync(skillLink())).toBe(elsewhere)
  })
})

describe("the skill entry with Linux's system", () => {
  it("5: the link is asked for with two arguments, and so it is with this computer's system when none is named", async () => {
    const named = await installTheEntry({ home, checkout, system: LINUX })
    expect(named.ok, named.says).toBe(true)
    expect(fs.links).toEqual([[skillSource(), skillLink()]])

    rmSync(join(home, '.claude'), { recursive: true, force: true })
    fs.links.length = 0
    const unnamed = await installTheEntry({ home, checkout })
    expect(unnamed.ok, unnamed.says).toBe(true)
    expect(fs.links).toEqual([[skillSource(), skillLink()]])
    expect(existsSync(join(skillLink(), 'SKILL.md'))).toBe(true)
  })
})

describe('the hook lines on Windows', () => {
  it("6: a second press finds its own hook line when Windows spells the hook's path with backslashes", () => {
    const hook = 'C:\\Users\\sam\\office\\tools\\session-hook.mjs'
    const another = 'C:\\Users\\sam\\another-office\\tools\\session-hook.mjs'
    for (const mode of ['start', 'stop', 'end'] as const) {
      const held = [theEntryGroup(hook, mode)]
      expect(held[0]?.hooks[0]?.command).toContain('C:\\\\Users')
      expect(arrayAlreadyRuns(held, hook)).toBe(true)
      expect(arrayAlreadyRuns(held, another)).toBe(false)
    }
  })

  it('7: a line names the program and its arguments, so a path with a space is one argument', () => {
    const hook = 'C:\\Program Files\\Mole Office\\resources\\office\\for-agents\\session-hook.mjs'
    const node = 'C:\\Program Files\\Mole Office\\resources\\office\\runtime\\node.exe'
    expect(theEntryGroup(hook, 'start', node, {}, 'win32')).toEqual({
      matcher: '',
      hooks: [{ type: 'command', command: node, args: [hook, 'start'], timeout: ENTRY_HOOK_TIMEOUT_SECONDS }],
    })
    expect(theEntryGroup(hook, 'end', null, {}, 'win32')).toEqual({
      matcher: '',
      hooks: [{ type: 'command', command: 'node', args: [hook, 'end'], timeout: ENTRY_HOOK_TIMEOUT_SECONDS }],
    })
  })

  it('8: a line written before this change is replaced in its place, and the file is backed up first', async () => {
    const hook = join(checkout, 'tools', 'session-hook.mjs')
    const theSettings = { hooks: { SessionStart: [theOlderGroup(hook, 'start')], Stop: [theOlderGroup(hook, 'stop')], SessionEnd: [theOlderGroup(hook, 'end')] } }
    const before = `${JSON.stringify(theSettings, null, 2)}\n`
    mkdirSync(join(home, '.claude'), { recursive: true })
    writeFileSync(join(home, '.claude', 'settings.json'), before, 'utf8')

    const windowsHook = 'C:\\Program Files\\Mole Office\\tools\\session-hook.mjs'
    const asJsonWritesIt = [{ matcher: '', hooks: [{ type: 'command', command: `node ${JSON.stringify(windowsHook)} start` }] }]
    expect(arrayAlreadyRuns(asJsonWritesIt, windowsHook)).toBe(true)
    for (const mode of ['start', 'stop', 'end'] as const) expect(arrayAlreadyRuns([theOlderGroup(hook, mode)], hook)).toBe(true)

    const pressed = await installTheEntry({ home, checkout, system: { platform: 'win32', aFolderIsLinkedBy: 'a-junction' } })
    expect(pressed.ok, pressed.says).toBe(true)
    expect(pressed).toMatchObject({
      changed: true, createdSkillLink: true,
      addedSessionStart: false, addedStop: false, addedSessionEnd: false,
      backupPath: join(home, '.claude', 'settings.json.mole-office-backup'),
    })
    expect(pressed.says).toContain('The older Windows hook lines at SessionStart, Stop and SessionEnd were replaced')
    expect(readFileSync(join(home, '.claude', 'settings.json.mole-office-backup'), 'utf8')).toBe(before)
    const after = JSON.parse(readFileSync(join(home, '.claude', 'settings.json'), 'utf8')) as { hooks: Record<string, unknown[]> }
    for (const mode of ['start', 'stop', 'end'] as const) {
      const event = mode === 'start' ? 'SessionStart' : mode === 'stop' ? 'Stop' : 'SessionEnd'
      expect(after.hooks[event]).toEqual([theEntryGroup(hook, mode, null, {}, 'win32')])
    }
  })

  it('9: Linux and the Mac still write the one shell string, unchanged', () => {
    const hook = '/opt/mole office/tools/session-hook.mjs'
    const node = '/opt/mole office/runtime/bin/node'
    for (const platform of ['linux', 'darwin']) {
      expect(theEntryGroup(hook, 'stop', null, {}, platform)).toEqual({
        matcher: '',
        hooks: [{ type: 'command', command: `node ${JSON.stringify(hook)} stop`, timeout: ENTRY_HOOK_TIMEOUT_SECONDS }],
      })
      expect(theEntryGroup(hook, 'stop', node, {}, platform)).toEqual({
        matcher: '',
        hooks: [{ type: 'command', command: `${JSON.stringify(node)} ${JSON.stringify(hook)} stop`, timeout: ENTRY_HOOK_TIMEOUT_SECONDS }],
      })
    }
  })

  it('10: a Windows press replaces the older line at each event in its place, and leaves every other hook and group as it was', async () => {
    const hook = join(checkout, 'tools', 'session-hook.mjs')
    const theirHook = { type: 'command', command: 'echo their own hook' }
    const theirGroup = { matcher: 'Bash', hooks: [{ type: 'command', command: 'echo another tool' }] }
    const theGroupsFor = (mode: 'start' | 'stop' | 'end'): unknown[] => [
      { matcher: '', hooks: [theOlderHookLine(hook, mode), theirHook] },
      theirGroup,
    ]
    const theSettings = {
      hooks: {
        SessionStart: theGroupsFor('start'),
        Stop: theGroupsFor('stop'),
        SessionEnd: theGroupsFor('end'),
      },
      theme: 'dark',
    }
    const before = `${JSON.stringify(theSettings, null, 2)}\n`
    mkdirSync(join(home, '.claude'), { recursive: true })
    writeFileSync(join(home, '.claude', 'settings.json'), before, 'utf8')

    const pressed = await installTheEntry({ home, checkout, system: { platform: 'win32', aFolderIsLinkedBy: 'a-junction' } })
    expect(pressed.ok, pressed.says).toBe(true)
    expect(pressed).toMatchObject({
      changed: true, createdSkillLink: true,
      addedSessionStart: false, addedStop: false, addedSessionEnd: false,
      backupPath: join(home, '.claude', 'settings.json.mole-office-backup'),
    })
    expect(pressed.says).toContain('The older Windows hook lines at SessionStart, Stop and SessionEnd were replaced')
    expect(readFileSync(join(home, '.claude', 'settings.json.mole-office-backup'), 'utf8')).toBe(before)

    const after = JSON.parse(readFileSync(join(home, '.claude', 'settings.json'), 'utf8')) as {
      hooks: Record<string, unknown[]>
      theme: string
    }
    expect(after.theme).toBe('dark')
    for (const mode of ['start', 'stop', 'end'] as const) {
      const event = mode === 'start' ? 'SessionStart' : mode === 'stop' ? 'Stop' : 'SessionEnd'
      expect(after.hooks[event]).toEqual([
        { matcher: '', hooks: [theEntryGroup(hook, mode, null, {}, 'win32').hooks[0], theirHook] },
        theirGroup,
      ])
      expect(theLinesNamingTheHook(after.hooks[event], hook)).toHaveLength(1)
    }
  })

  it('11: a line that names the hook but is not the older line is left as it is, and no line is added', async () => {
    const hook = join(checkout, 'tools', 'session-hook.mjs')
    const theirOwnLine = (mode: 'start' | 'stop' | 'end'): unknown => ({
      matcher: '',
      hooks: [{ type: 'command', command: `node ${JSON.stringify(hook)} ${mode} --their-own-word`, timeout: ENTRY_HOOK_TIMEOUT_SECONDS }],
    })
    const theSettings = { hooks: { SessionStart: [theirOwnLine('start')], Stop: [theirOwnLine('stop')], SessionEnd: [theirOwnLine('end')] } }
    const before = `${JSON.stringify(theSettings, null, 2)}\n`
    mkdirSync(join(home, '.claude', 'skills'), { recursive: true })
    symlinkSync(skillSource(), skillLink())
    writeFileSync(join(home, '.claude', 'settings.json'), before, 'utf8')

    const pressed = await installTheEntry({ home, checkout, system: { platform: 'win32', aFolderIsLinkedBy: 'a-junction' } })
    expect(pressed.ok, pressed.says).toBe(true)
    expect(pressed).toMatchObject({
      changed: false, backupPath: null,
      addedSessionStart: false, addedStop: false, addedSessionEnd: false,
    })
    expect(pressed.says).toContain('Nothing was written.')
    expect(readFileSync(join(home, '.claude', 'settings.json'), 'utf8')).toBe(before)
  })

  it('12: a Linux and a Mac press over their own line replace nothing and write nothing', async () => {
    const hook = join(checkout, 'tools', 'session-hook.mjs')
    mkdirSync(join(home, '.claude', 'skills'), { recursive: true })
    symlinkSync(skillSource(), skillLink())
    for (const platform of ['linux', 'darwin'] as const) {
      const theSettings = { hooks: { SessionStart: [theOlderGroup(hook, 'start')], Stop: [theOlderGroup(hook, 'stop')], SessionEnd: [theOlderGroup(hook, 'end')] } }
      const before = `${JSON.stringify(theSettings, null, 2)}\n`
      writeFileSync(join(home, '.claude', 'settings.json'), before, 'utf8')
      const pressed = await installTheEntry({ home, checkout, system: { platform, aFolderIsLinkedBy: 'a-symbolic-link' } })
      expect(pressed.ok, pressed.says).toBe(true)
      expect(pressed).toMatchObject({
        changed: false, backupPath: null,
        addedSessionStart: false, addedStop: false, addedSessionEnd: false,
      })
      expect(readFileSync(join(home, '.claude', 'settings.json'), 'utf8')).toBe(before)
    }
  })
})
