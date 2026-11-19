// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A KEY FILE ON WINDOWS IS ONLY THIS USER'S, AND IT IS MADE SO BEFORE A KEY IS IN IT. Wave 13t, round W15, item 12.
 *
 * Linux and the Mac keep a key file private by its mode, 0600. Windows ignores that mode, so until this round a key
 * file there took the access list of its folder. Now the system layer says how this system makes a file private
 * (src/config/systems/the-system.mjs). On Windows it sets the file's access list to one entry, this user's, and reads
 * the list back (src/config/systems/windows-private-files.mjs). Three writers ask it: the office's key file
 * (src/server/lib/keys.ts), a dispatched run's key file (src/server/lib/dispatched-agent-keys.ts) and the mail tool's
 * key (src/config/the-mail-tool.mjs). Each makes the file empty, has its list set and read back, and only then writes
 * the key. When the list cannot be set, each refuses in words and writes no key.
 *
 * This file is read on Linux with a stand-in for PowerShell. It shows what is asked of Windows and how the answer is
 * read. It cannot show that the script works on Windows: only a run on a Windows computer can show that.
 *
 *   1-5: the script and its answer. The script shuts out the folder's entries, gives this user full control, writes
 *        only the list, and reads it back by security identifier. The path travels as base64. Exactly one entry, this
 *        user's, allowing full control and not taken from the folder, is private; every other answer is refused in
 *        words, and so is a script that did not run or did not finish.
 *   6: Linux and the Mac make a file private by its mode, and Windows by its access list.
 *   7-11: the office's key file. On Windows its first making and a rewrite each go through a file beside it that is
 *        empty when its list is set, and leave nothing beside it. A list that cannot be set, or reads back wrong,
 *        writes no key and keeps the file as it was. On Linux nothing is asked and the file is mode 0600.
 *   12-15: a dispatched run's key file. On Windows its list is set while it is empty. A refusal removes it and rolls
 *        the dispatch back, and the transaction's own removal of a file that is already gone does not throw. On Linux
 *        nothing is asked and the file is mode 0600.
 *   16-18: the mail tool's key. On Windows it goes through an empty file beside it whose list is set first, and a
 *        refusal writes nothing. On Linux it is mode 0600. Until round W28 case 17's refusal ended "Nothing was
 *        changed."; it says the key was left as it was, because its words go on when the file beside it is left.
 *   20: when that file beside it cannot be removed, the refusal still says what stopped the write first, then where
 *        the file is, and its cause is the first error (wave 13t, round W28).
 *   19: the sentence Settings shows about the office's key file says that on Windows its access list lets only this
 *        user read and write it, and still says that this is unverified on Windows.
 *
 * Mutations, in the commit message that added the code. Round W28's, each after a control run, and each restored:
 *   - the file beside the key removed as before, so the removal's error takes the place of the first: case 20 goes red.
 *   - the key's refusal says nothing was changed again: cases 17 and 20 go red.
 *   - the first error's own full stop kept, so the words have two: case 20 goes red.
 *
 * NO REAL KEY IS EVER USED OR PRINTED HERE. Every key is made by the office for a scratch folder, or is a made-up
 * string.
 */

import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { theSystemFor } from '../src/config/systems/the-system.mjs'
import { THE_PROTECTION_IN_FORCE } from '../src/shared/office-keys.ts'
import {
  FULL_CONTROL,
  theScriptThatMakesAFilePrivate,
  whatTheListSays,
  windowsPrivateFiles,
} from '../src/config/systems/windows-private-files.mjs'
import { freshDb, type TestDb } from './helpers.ts'

type Did =
  | { command: string; ran: true; status: number; stdout: string; stderr: string }
  | { command: string; ran: false; reason: string }

/**
 * THE SYSTEM THE WRITERS ASK, MADE WINDOWS ON DEMAND. With `privately` null they are asked about this computer's own
 * system, Linux here. With it set, they are asked about this computer's system with Windows's way of making a file
 * private, over a stand-in for PowerShell.
 */
const here = vi.hoisted(() => ({ privately: null as unknown }))
vi.mock('../src/config/systems/the-system.mjs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/config/systems/the-system.mjs')>()
  return {
    ...actual,
    thisSystem: () => (here.privately === null ? actual.thisSystem() : { ...actual.thisSystem(), aFileIsMadePrivate: here.privately }),
  }
})

const ME = 'S-1-5-21-1004336348-1177238915-682003330-1001'
const listed = (...lines: string[]): Did => ({ command: 'powershell.exe', ran: true, status: 0, stdout: `${lines.join('\r\n')}\r\n`, stderr: '' })
const PRIVATE = listed(`me ${ME}`, 'protected True', `entry ${ME} Allow ${String(FULL_CONTROL)} False`)

/** The path a script was written for, read back out of its base64. */
function thePathIn(script: string): string {
  const found = /FromBase64String\('([^']*)'\)/u.exec(script)
  if (found === null) throw new Error('the script carries no path in base64')
  return Buffer.from(found[1]!, 'base64').toString('utf8')
}

/**
 * A stand-in for PowerShell. It notes each file it is asked about and how many bytes that file held when it was
 * asked, and hands back `answer`.
 */
function aStandIn(answer: Did) {
  const asked: { path: string; bytes: number }[] = []
  const scripts: string[] = []
  const powershell = (script: string): Did => {
    scripts.push(script)
    const path = thePathIn(script)
    asked.push({ path, bytes: existsSync(path) ? statSync(path).size : -1 })
    return answer
  }
  const commands = { powershell, startPowerShell: async (script: string): Promise<Did> => powershell(script) }
  return { commands, asked, scripts, set: windowsPrivateFiles(commands) }
}

/** The writers below are asked about Windows, over this stand-in. */
function onWindows(answer: Did) {
  const standIn = aStandIn(answer)
  here.privately = standIn.set
  return standIn
}

let t: TestDb
let keys: typeof import('../src/server/lib/keys.ts')
let dispatched: typeof import('../src/server/lib/dispatched-agent-keys.ts')
let mailTool: typeof import('../src/config/the-mail-tool.mjs')
const scratch: string[] = []

beforeAll(async () => {
  // A throwaway database first: importing lib/keys.ts opens whatever MOLE_OFFICE_DB names.
  t = await freshDb()
  keys = await import('../src/server/lib/keys.ts')
  dispatched = await import('../src/server/lib/dispatched-agent-keys.ts')
  mailTool = await import('../src/config/the-mail-tool.mjs')
})

afterEach(() => {
  here.privately = null
  process.env.MOLE_OFFICE_DB = t.file
  keys.forgetTheKeysThisProcessRead()
})

afterAll(() => {
  t.close()
  for (const folder of scratch) rmSync(folder, { recursive: true, force: true })
})

function aScratchFolder(): string {
  const folder = mkdtempSync(join(tmpdir(), 'w15-private-'))
  scratch.push(folder)
  return folder
}

/** A fresh folder for the office's key file, and the path the file is expected at. */
function aFreshKeyFile(): { folder: string; file: string } {
  const folder = aScratchFolder()
  process.env.MOLE_OFFICE_DB = join(folder, 'panelx.db')
  keys.forgetTheKeysThisProcessRead()
  return { folder, file: join(folder, 'keys.json') }
}

const modeOf = (path: string): number => statSync(path).mode & 0o777

describe('the script that makes a file private on Windows, and how its answer is read', () => {
  it('1: shuts out the folder, gives this user full control, writes only the list, and reads it back by identifier', () => {
    const script = theScriptThatMakesAFilePrivate('C:\\Users\\Zoë\\AppData\\Local\\mole office\\keys.json')
    for (const line of [
      "$ErrorActionPreference = 'Stop'",
      '$me = [System.Security.Principal.WindowsIdentity]::GetCurrent().User',
      '$list = New-Object System.Security.AccessControl.FileSecurity',
      '$list.SetAccessRuleProtection($true, $false)',
      '$list.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($me, [System.Security.AccessControl.FileSystemRights]::FullControl, [System.Security.AccessControl.AccessControlType]::Allow)))',
      '[System.IO.File]::SetAccessControl($path, $list)',
      '$back = [System.IO.File]::GetAccessControl($path)',
      'foreach ($entry in $back.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier])) {',
    ]) {
      expect(script).toContain(line)
    }
    // NO ADMINISTRATOR: the script changes no owner and asks for no privilege.
    for (const word of ['SetOwner', 'takeown', 'icacls', 'Administrators', 'RunAs']) expect(script).not.toContain(word)
  })

  it('2: carries the path as base64, so a quote mark or a curly quote in it cannot end a string early', () => {
    const path = "C:\\Users\\O'Brien\\AppData\\Local\\mole office\\it’s here\\keys.json"
    const script = theScriptThatMakesAFilePrivate(path)
    expect(script).not.toContain('O\'Brien')
    expect(script).not.toContain('it’s')
    expect(thePathIn(script)).toBe(path)
  })

  it("3: reads one entry, this user's, allowing full control, set on the file, with the folder shut out, as private", () => {
    expect(whatTheListSays(PRIVATE.ran ? PRIVATE.stdout : '')).toBeNull()
  })

  it('4: refuses in words every other list it reads back', () => {
    const entry = `entry ${ME} Allow ${String(FULL_CONTROL)} False`
    const cases: [string[], string][] = [
      [['protected True', entry], 'Windows did not say which user this is'],
      [[`me ${ME}`, 'protected False', entry], 'its access list still takes entries from its folder'],
      [[`me ${ME}`, 'protected True'], 'its access list has 0 entries, not one'],
      [[`me ${ME}`, 'protected True', entry, `entry S-1-5-32-544 Allow ${String(FULL_CONTROL)} False`], 'its access list has 2 entries, not one'],
      [[`me ${ME}`, 'protected True', `entry S-1-5-32-545 Allow ${String(FULL_CONTROL)} False`], `its one entry is for S-1-5-32-545, not for this user (${ME})`],
      [[`me ${ME}`, 'protected True', `entry ${ME} Deny ${String(FULL_CONTROL)} False`], 'its one entry is Deny, not Allow'],
      [[`me ${ME}`, 'protected True', `entry ${ME} Allow 1179785 False`], `its one entry gives the rights 1179785, not full control (${String(FULL_CONTROL)})`],
      [[`me ${ME}`, 'protected True', `entry ${ME} Allow ${String(FULL_CONTROL)} True`], 'its one entry was taken from its folder'],
    ]
    for (const [lines, says] of cases) expect(whatTheListSays(`${lines.join('\r\n')}\r\n`), lines.join(' | ')).toBe(says)
  })

  it('5: hands PowerShell the script for that file, and refuses in words what did not run, failed or read back wrong', () => {
    const path = 'C:\\data\\keys.json'
    const done = aStandIn(PRIVATE)
    expect(done.set.set(path)).toEqual({ ok: true })
    expect(done.scripts).toEqual([theScriptThatMakesAFilePrivate(path)])

    const notRun = aStandIn({ command: 'powershell.exe', ran: false, reason: 'powershell.exe could not be run: spawnSync ENOENT' })
    expect(notRun.set.set(path)).toEqual({ ok: false, says: 'its access list could not be set: powershell.exe could not be run: spawnSync ENOENT' })

    const failed = aStandIn({ command: 'powershell.exe', ran: true, status: 1, stdout: '', stderr: '\r\nAttempted to perform an unauthorized operation.\r\n' })
    expect(failed.set.set(path)).toEqual({ ok: false, says: 'its access list could not be set: Attempted to perform an unauthorized operation.' })

    const wrong = aStandIn(listed(`me ${ME}`, 'protected False', `entry ${ME} Allow ${String(FULL_CONTROL)} False`))
    expect(wrong.set.set(path)).toEqual({
      ok: false,
      says: "its access list was set, but what Windows read back is not this user's alone: its access list still takes entries from its folder",
    })
  })
})

describe('which way each system makes a file private', () => {
  it('6: Linux and the Mac by its mode, and Windows by its access list', () => {
    expect(theSystemFor('linux').aFileIsMadePrivate).toEqual({ by: 'its-mode' })
    expect(theSystemFor('darwin').aFileIsMadePrivate).toEqual({ by: 'its-mode' })
    expect(theSystemFor('win32').aFileIsMadePrivate.by).toBe('its-access-list')
  })
})

describe("the office's key file", () => {
  it('7: on Windows is first made empty beside its place, made private, and only then given its keys', () => {
    const { folder, file } = aFreshKeyFile()
    const windows = onWindows(PRIVATE)
    keys.ensureKeysExist()
    expect(windows.asked).toHaveLength(1)
    const [asked] = windows.asked
    expect(join(asked!.path, '..')).toBe(folder)
    expect(asked!.path).not.toBe(file)
    expect(asked!.bytes).toBe(0)
    const held = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
    expect(String(held['person'])).toMatch(/^[0-9a-f]{64}$/u)
    expect(String(held['office'])).toMatch(/^[0-9a-f]{64}$/u)
    expect(readdirSync(folder)).toEqual(['keys.json'])
  })

  it('8: on Windows is rewritten through an empty file beside it, made private first, when a provider key is set', () => {
    const { folder, file } = aFreshKeyFile()
    onWindows(PRIVATE)
    keys.ensureKeysExist()
    const windows = onWindows(PRIVATE)
    keys.setProviderSecret('deepseek', 'a-made-up-provider-key-used-only-by-this-test')
    expect(windows.asked).toHaveLength(1)
    expect(join(windows.asked[0]!.path, '..')).toBe(folder)
    expect(windows.asked[0]!.path).not.toBe(file)
    expect(windows.asked[0]!.bytes).toBe(0)
    const providers = (JSON.parse(readFileSync(file, 'utf8')) as { providers: Record<string, string> }).providers
    expect(providers['deepseek']).toBe('a-made-up-provider-key-used-only-by-this-test')
    expect(readdirSync(folder)).toEqual(['keys.json'])
  })

  it('9: on Windows makes no key file, and says why, when the list cannot be set', () => {
    const { folder } = aFreshKeyFile()
    onWindows({ command: 'powershell.exe', ran: true, status: 1, stdout: '', stderr: 'Attempted to perform an unauthorized operation.\r\n' })
    expect(() => keys.ensureKeysExist()).toThrow(
      /no key was written to it: .*could not be made one that only this user may read and write \(its access list could not be set: Attempted to perform an unauthorized operation\.\)/u,
    )
    expect(readdirSync(folder)).toEqual([])
  })

  it('10: on Windows keeps the key file as it was, and says why, when the list for a rewrite reads back wrong', () => {
    const { folder, file } = aFreshKeyFile()
    onWindows(PRIVATE)
    keys.ensureKeysExist()
    const before = readFileSync(file)
    onWindows(listed(`me ${ME}`, 'protected True', `entry S-1-1-0 Allow ${String(FULL_CONTROL)} False`))
    expect(() => keys.setProviderSecret('deepseek', 'a-made-up-provider-key-used-only-by-this-test')).toThrow(
      /what Windows read back is not this user's alone: its one entry is for S-1-1-0/u,
    )
    expect(readFileSync(file).equals(before)).toBe(true)
    expect(readdirSync(folder)).toEqual(['keys.json'])
  })

  it('11: on Linux asks nothing of Windows and is mode 0600, made and rewritten', () => {
    const { folder, file } = aFreshKeyFile()
    const windows = aStandIn(PRIVATE)
    keys.ensureKeysExist()
    expect(modeOf(file)).toBe(0o600)
    keys.setProviderSecret('deepseek', 'a-made-up-provider-key-used-only-by-this-test')
    expect(modeOf(file)).toBe(0o600)
    expect(windows.asked).toEqual([])
    expect(readdirSync(folder)).toEqual(['keys.json'])
  })
})

describe("a dispatched run's key file", () => {
  /** Where a dispatched run's key is kept: beside the key file, as dispatched-agent-keys.ts says. */
  const theRunsKeyFile = (folder: string, runId: string): string => join(folder, 'agent-run-keys', runId)
  const heldBy = (agentId: string): number =>
    (t.client.sqlite.prepare('SELECT count(*) AS n FROM held_keys WHERE whose_id = ?').get(agentId) as { n: number }).n

  it("12: on Windows has its list set while it is empty, and then holds the run's key", () => {
    const { folder } = aFreshKeyFile()
    const windows = onWindows(PRIVATE)
    dispatched.withDispatchedAgentKeys(() => dispatched.keepADispatchedAgentsKey('w15-run-a', 'w15-agent-a', 'no-key'))
    expect(windows.asked).toEqual([{ path: theRunsKeyFile(folder, 'w15-run-a'), bytes: 0 }])
    expect(readFileSync(theRunsKeyFile(folder, 'w15-run-a'), 'utf8')).toMatch(/^[0-9a-f]{64}$/u)
    expect(heldBy('w15-agent-a')).toBe(1)
  })

  it('13: on Windows refuses in words, removes the file and rolls the dispatch back when the list cannot be set', () => {
    const { folder } = aFreshKeyFile()
    onWindows({ command: 'powershell.exe', ran: false, reason: 'powershell.exe did not finish (killed by SIGTERM)' })
    let thrown: unknown = null
    try {
      dispatched.withDispatchedAgentKeys(() => dispatched.keepADispatchedAgentsKey('w15-run-b', 'w15-agent-b', 'no-key'))
    } catch (err) {
      thrown = err
    }
    // THE REFUSAL IS WHAT THE CALLER HEARS, not the transaction's own removal of a file that is already gone.
    expect(thrown).toMatchObject({
      status: 500,
      message:
        "This run's private key file could not be made one that only this user may read and write (its access list could not be set: " +
        'powershell.exe did not finish (killed by SIGTERM)). No key was written to it, and the run was not dispatched.',
    })
    expect(existsSync(theRunsKeyFile(folder, 'w15-run-b'))).toBe(false)
    expect(heldBy('w15-agent-b')).toBe(0)
  })

  it('14: forgets a key whose file is already gone without throwing', () => {
    aFreshKeyFile()
    expect(() => dispatched.forgetADispatchedAgentsKey('w15-run-never-kept')).not.toThrow()
  })

  it('15: on Linux asks nothing of Windows and is mode 0600', () => {
    const { folder } = aFreshKeyFile()
    const windows = aStandIn(PRIVATE)
    dispatched.withDispatchedAgentKeys(() => dispatched.keepADispatchedAgentsKey('w15-run-c', 'w15-agent-c', 'no-key'))
    expect(modeOf(theRunsKeyFile(folder, 'w15-run-c'))).toBe(0o600)
    expect(windows.asked).toEqual([])
  })
})

describe("the mail tool's key", () => {
  it('16: on Windows goes through an empty file beside it whose list is set first, and leaves nothing beside it', () => {
    const folder = aScratchFolder()
    const path = join(folder, 'key')
    const windows = aStandIn(PRIVATE)
    mailTool.writeTheKeyWhole(path, 'a-made-up-tool-key\n', windows.set)
    expect(windows.asked).toEqual([{ path: `${path}.${String(process.pid)}.new`, bytes: 0 }])
    expect(readFileSync(path, 'utf8')).toBe('a-made-up-tool-key\n')
    expect(readdirSync(folder)).toEqual(['key'])
  })

  it('17: on Windows writes nothing, keeps the key there, and says why, when the list cannot be set', () => {
    const folder = aScratchFolder()
    const path = join(folder, 'key')
    writeFileSync(path, 'the-key-before\n')
    const windows = aStandIn({ command: 'powershell.exe', ran: true, status: 1, stdout: '', stderr: 'Access to the path is denied.' })
    expect(() => mailTool.writeTheKeyWhole(path, 'a-made-up-tool-key\n', windows.set)).toThrow(
      `The mail tool's key was not written to ${path}, so it was left as it was: the file it goes through could not be made one that only this user may read and write (its access list could not be set: Access to the path is denied.).`,
    )
    expect(readFileSync(path, 'utf8')).toBe('the-key-before\n')
    expect(readdirSync(folder)).toEqual(['key'])
  })

  it("18: is saved through the system's own way, on Windows by its list and on Linux at mode 0600", () => {
    const home = aScratchFolder()
    const windows = onWindows(PRIVATE)
    mailTool.saveTheMailToolsKey(home, 'a-made-up-tool-key')
    const key = join(mailTool.theMailToolFolder({}, home), 'key')
    expect(windows.asked).toEqual([{ path: `${key}.${String(process.pid)}.new`, bytes: 0 }])
    here.privately = null
    mailTool.saveTheMailToolsKey(home, 'another-made-up-tool-key')
    expect(modeOf(key)).toBe(0o600)
    expect(readFileSync(key, 'utf8')).toBe('another-made-up-tool-key\n')
    expect(windows.asked).toHaveLength(1)
  })

  it('20: on Windows still says what stopped the write first, then where the file beside it is, when that file cannot be removed', () => {
    // A STAND-IN THAT PUTS A FOLDER WITH A FILE IN IT WHERE THE FILE BESIDE THE KEY IS, and then says the list could not
    // be set. That folder cannot be removed as a file, so the file beside the key is left.
    const folder = aScratchFolder()
    const path = join(folder, 'key')
    const beside = `${path}.${String(process.pid)}.new`
    writeFileSync(path, 'the-key-before\n')
    const set = (at: string) => {
      rmSync(at)
      mkdirSync(at)
      writeFileSync(join(at, 'kept'), 'kept')
      return { ok: false as const, says: 'its access list could not be set: Access to the path is denied.' }
    }
    const first = `The mail tool's key was not written to ${path}, so it was left as it was: the file it goes through could not be made one that only this user may read and write (its access list could not be set: Access to the path is denied.).`
    let thrown: unknown
    try {
      mailTool.writeTheKeyWhole(path, 'a-made-up-tool-key\n', { by: 'its-access-list', set })
    } catch (err) {
      thrown = err
    }
    expect(thrown, 'the write did not throw').toBeInstanceOf(Error)
    const said = (thrown as Error).message
    expect(said.startsWith(`${first.replace(/\.$/u, '')}. The file this write made beside it could not be removed, and is still at ${beside} (`), said).toBe(true)
    expect(said).not.toContain('Nothing was changed')
    expect(((thrown as Error).cause as Error | undefined)?.message, 'the cause is not what stopped the write').toBe(first)
    expect(readFileSync(path, 'utf8')).toBe('the-key-before\n')
    expect(readFileSync(join(beside, 'kept'), 'utf8')).toBe('kept')
  })
})

describe('what Settings says protects the key file', () => {
  it("19: on Windows, an access list that lets only this user read and write it, which is unverified on Windows", () => {
    expect(THE_PROTECTION_IN_FORCE).toContain(
      "On Windows the file's access list lets only your user account read and write it, and that is unverified on Windows.",
    )
    expect(THE_PROTECTION_IN_FORCE).not.toContain('per-user protection')
  })
})
