// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A WINDOWS DATA FOLDER IS NEVER ON A NETWORK PLACE, AND MAY BE ON ANY LOCAL DRIVE.
 *
 * DF4 and DF23 of design/window/the-data-folder-move.criteria.md are checked here, for the move in
 * src/config/the-data-folder-move.mjs and the installer's data page in scripts/windows-installer.nsi. The office's
 * database keeps a write-ahead log, which does not work on a network share, so a UNC path and a drive Windows reports
 * as a network drive are refused. A drive whose type Windows cannot tell is refused too, and never taken as local.
 * There is no Windows here: the move's refusal is asked with the facts a Windows machine would hand it, the drive's
 * reading is asked of a stand-in for PowerShell, and the installer is read as text. The move refuses with a code and its
 * values, and a case that reads the words reads the English of that code, as the move gives it.
 *
 * Its cases:
 *   1. a UNC path, in both of its forms, is refused as a network place and not as a place that is not a full path,
 *      while a `\\?\` drive path is not a network path;
 *   2. a place on a drive Windows reports as a network drive is refused with the network drive's code;
 *   3. a drive whose type could not be read, a drive nobody asked about, and a type that is not a local drive's are
 *      each refused with a code of its own whose English says Windows could not tell, before the temporary folder is
 *      asked;
 *   4. a removable drive, a fixed drive, a CD drive and a RAM disk are allowed;
 *   5. the drive is read with PowerShell started and waited for, never with the call that holds the thread, and only
 *      on Windows for a place that begins with a drive letter; a run that failed, a status that is not 0 and an answer
 *      that is not a type are each a drive that could not be read;
 *   6. the move asks the drive of its place before it stops anything;
 *   7. the installer tells a UNC path as the move does, over the same places;
 *   8. the installer asks GetDriveType after the full-path check and before the temporary folder, refuses a network
 *      drive with the write-ahead log's reason, and allows only the types the move allows.
 *
 * MUTATIONS: none has been run on this file yet.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, it } from 'vitest'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const THE_INSTALLER = join(ROOT, 'scripts', 'windows-installer.nsi')

type TheMove = typeof import('../src/config/the-data-folder-move.mjs')
type Facts = Parameters<TheMove['whyAMoveThereIsRefused']>[1]
type WhatACommandDid =
  | { command: string; ran: true; status: number; stdout: string; stderr: string }
  | { command: string; ran: false; reason: string }

const folders: string[] = []

afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})

/** The engine, imported inside a case so the test file loads and a red run still counts. */
async function theMove(): Promise<TheMove> {
  return await import('../src/config/the-data-folder-move.mjs')
}

/** The facts a Windows machine would hand a move to a place that is empty, on a fixed drive C:. */
function windowsFacts(overrides: Partial<Facts> = {}): Facts {
  return {
    from: 'C:\\Users\\a-person\\AppData\\Roaming\\mole-office\\data',
    database: 'mole-office.db',
    installFolder: 'C:\\Users\\a-person\\AppData\\Local\\Programs\\Mole Office',
    perUserFolder: 'C:\\Users\\a-person\\AppData\\Roaming\\mole-office',
    processEnv: {},
    envFile: 'C:\\Users\\a-person\\AppData\\Roaming\\mole-office\\.env',
    mark: { state: 'absent' },
    platform: 'win32',
    freeBytes: 100_000,
    folderBytes: 1_000,
    walk: { names: [], files: new Map(), bytes: 1_000 },
    placeExists: false,
    placeIsAFolder: false,
    placeEmpty: false,
    holderExists: true,
    leaveOut: [],
    loginUnit: { unit: 'none', unitPath: '', startsAtLogin: false, activeWord: null, fromAnAppImage: false },
    refusedFolders: [],
    drive: { root: 'C:\\', type: 'Fixed' },
    ...overrides,
  }
}

/** A stand-in for PowerShell that answers every script with `answer`, and counts each way it was asked. */
function aPowerShell(answer: WhatACommandDid) {
  const asked = { held: [] as string[], waited: [] as string[] }
  return {
    asked,
    commands: {
      powershell: (script: string): WhatACommandDid => {
        asked.held.push(script)
        return answer
      },
      startPowerShell: async (script: string): Promise<WhatACommandDid> => {
        asked.waited.push(script)
        return answer
      },
    },
  }
}

/** A run of PowerShell that ended with `status` and printed `stdout` and `stderr`. */
function printed(stdout: string, status = 0, stderr = ''): WhatACommandDid {
  return { command: 'powershell', ran: true, status, stdout, stderr }
}

/** The text of one NSIS function, from its `Function` line to its `FunctionEnd`, read from the installer. */
function theFunction(name: string): string {
  const code = readFileSync(THE_INSTALLER, 'utf8').replace(/\r\n/g, '\n')
  const start = code.indexOf(`\nFunction ${name}\n`)
  if (start < 0) throw new Error(`the installer has no function ${name}`)
  const end = code.indexOf('\nFunctionEnd\n', start)
  if (end < 0) throw new Error(`the installer's function ${name} has no FunctionEnd`)
  return code.slice(start + 1, end + '\nFunctionEnd'.length)
}

// ============================================================ the move

it('DF4: a UNC path, in both of its forms, is refused as a network place and not as a place that is not a full path', async () => {
  const move = await theMove()
  const facts = windowsFacts()

  for (const to of ['\\\\a-server\\a-share\\mole-office', '\\\\?\\UNC\\a-server\\a-share\\mole-office', '\\\\?\\unc\\a-server\\a-share\\mole-office']) {
    expect(move.isAWindowsNetworkPath(to), to).toBe(true)
    const refused = move.whyAMoveThereIsRefused(to, facts)
    expect(refused, to).toEqual({ code: 'dataFolderPlaceIsANetworkPath', values: { to } })
    expect(refused, to).toEqual(move.theWindowsPlaceIsOnANetworkRefusal(to, null))
    expect(refused, to).not.toEqual(move.thePlaceIsNotAFullPathRefusal(to, 'win32'))
    const why = move.theRefusalInEnglish(refused!)
    expect(why, to).toContain('write-ahead log')
    expect(why, to).toContain('network share')
    expect(why, to).toContain('nothing was changed')
  }

  // A `\\?\` or `\\.\` path to a drive is not a network path, so it is answered as a place that is not a full path.
  for (const to of ['\\\\?\\D:\\mole-office', '\\\\.\\D:\\mole-office']) {
    expect(move.isAWindowsNetworkPath(to), to).toBe(false)
    expect(move.whyAMoveThereIsRefused(to, facts), to).toEqual(move.thePlaceIsNotAFullPathRefusal(to, 'win32'))
    expect(move.whyAMoveThereIsRefused(to, facts)?.code, to).toBe('dataFolderPlaceNotAFullPathOnWindows')
  }
  expect(move.isAWindowsNetworkPath('D:\\mole-office')).toBe(false)
})

it('DF4: a place on a drive Windows reports as a network drive is refused, with a sentence that names the drive', async () => {
  const move = await theMove()
  const to = 'N:\\mole-office'
  const refused = move.whyAMoveThereIsRefused(to, windowsFacts({ drive: { root: 'N:\\', type: 'Network' } }))

  expect(refused).toEqual({ code: 'dataFolderPlaceOnANetworkDrive', values: { to, drive: 'N:\\' } })
  expect(refused).toEqual(move.theWindowsPlaceIsOnANetworkRefusal(to, 'N:\\'))
  const why = move.theRefusalInEnglish(refused!)
  expect(why).toContain(to)
  expect(why).toContain('N:\\')
  expect(why).toContain('write-ahead log')
  expect(why).toContain('network share')
  expect(why).toContain('nothing was changed')
})

it('DF4: a drive whose type Windows cannot tell is refused, and is never taken as a local drive', async () => {
  const move = await theMove()
  const to = 'E:\\mole-office'
  const temporary = [{ kind: 'temporary' as const, variable: 'TEMP', folder: 'E:\\', names: ['E:\\'] }]

  // The reason the drive's reading gives is carried as it came.
  const unread = move.whyAMoveThereIsRefused(to, windowsFacts({ drive: { root: 'E:\\', unread: 'PowerShell could not be started' } }))
  expect(unread).toEqual({ code: 'dataFolderDriveNotRead', values: { to, drive: 'E:\\', why: 'PowerShell could not be started' } })
  expect(unread).toEqual(move.theWindowsDriveCannotBeToldRefusal(to, 'E:\\', { unread: 'PowerShell could not be started' }))
  expect(move.theRefusalInEnglish(unread!)).toContain('could not tell')
  expect(move.theRefusalInEnglish(unread!)).toContain('(PowerShell could not be started)')

  // A move whose drive nobody asked Windows about is refused too, and not let through.
  const notAsked = move.whyAMoveThereIsRefused(to, windowsFacts({ drive: null }))
  expect(notAsked).toEqual({ code: 'dataFolderDriveNotAsked', values: { to, drive: 'E:\\' } })
  expect(notAsked).toEqual(move.theWindowsDriveCannotBeToldRefusal(to, 'E:\\', null))
  expect(move.theRefusalInEnglish(notAsked!)).toContain('could not tell')
  expect(move.theRefusalInEnglish(notAsked!)).toContain('(nobody asked Windows)')

  for (const type of ['Unknown', 'NoRootDirectory']) {
    const refused = move.whyAMoveThereIsRefused(to, windowsFacts({ drive: { root: 'E:\\', type } }))
    expect(refused, type).toEqual({ code: 'dataFolderDriveTypeUnknown', values: { to, drive: 'E:\\', type } })
    expect(refused, type).toEqual(move.theWindowsDriveCannotBeToldRefusal(to, 'E:\\', { type }))
    expect(move.theRefusalInEnglish(refused!), type).toContain(`(Windows answered ${type})`)
  }

  // The drive is asked before the temporary folder, so a drive that cannot be told is not answered as that folder.
  expect(move.whyAMoveThereIsRefused(to, windowsFacts({ drive: { root: 'E:\\', type: 'Unknown' }, refusedFolders: temporary }))).toEqual(
    move.theWindowsDriveCannotBeToldRefusal(to, 'E:\\', { type: 'Unknown' }),
  )
  expect(move.whyAMoveThereIsRefused(to, windowsFacts({ drive: { root: 'E:\\', type: 'Fixed' }, refusedFolders: temporary }))).toEqual(
    move.theWindowsPlaceIsInTheTemporaryFolderRefusal(to, 'E:\\', 'TEMP'),
  )
})

it('DF4: a place on a removable drive, a fixed drive, a CD drive or a RAM disk is allowed', async () => {
  const move = await theMove()
  const to = 'F:\\mole-office'

  expect([...move.THE_LOCAL_DRIVE_TYPES].sort()).toEqual(['CDRom', 'Fixed', 'Ram', 'Removable'])
  for (const type of ['Removable', 'Fixed', 'CDRom', 'Ram']) {
    expect(move.whyAMoveThereIsRefused(to, windowsFacts({ drive: { root: 'F:\\', type } })), type).toBeNull()
  }
})

it('DF4: the drive is read by PowerShell started with no wait on the thread, and only on Windows for a drive letter', async () => {
  const move = await theMove()

  const fixed = aPowerShell(printed('Fixed'))
  expect(await move.theDriveOfAPlace('d:\\mole-office', 'win32', fixed.commands)).toEqual({ root: 'D:\\', type: 'Fixed' })
  expect(fixed.asked.held, 'no script is run in the way that holds the thread').toEqual([])
  expect(fixed.asked.waited).toEqual([move.theScriptThatReadsADrive('D:\\')])
  expect(move.theScriptThatReadsADrive('D:\\')).toContain("'D:\\'")
  expect(move.theScriptThatReadsADrive('D:\\')).not.toContain('mole-office')

  const network = aPowerShell(printed('Network\r\n'))
  expect(await move.theDriveOfAPlace('N:\\mole-office', 'win32', network.commands)).toEqual({ root: 'N:\\', type: 'Network' })

  // Off Windows, and for a place that does not begin with a drive letter, nothing is started.
  for (const [to, platform] of [['/a/new/data', 'linux'], ['/a/new/data', 'darwin'], ['\\\\a-server\\a-share\\data', 'win32']] as const) {
    const none = aPowerShell(printed('Fixed'))
    expect(await move.theDriveOfAPlace(to, platform, none.commands), `${platform} ${to}`).toBeNull()
    expect(none.asked).toEqual({ held: [], waited: [] })
  }

  const notRun = aPowerShell({ command: 'powershell', ran: false, reason: 'powershell.exe was not found' })
  expect(await move.theDriveOfAPlace('D:\\mole-office', 'win32', notRun.commands)).toEqual({ root: 'D:\\', unread: 'powershell.exe was not found' })

  const failed = aPowerShell(printed('', 1, '\r\nException calling "DriveInfo"\r\nat line 1\r\n'))
  expect(await move.theDriveOfAPlace('D:\\mole-office', 'win32', failed.commands)).toEqual({ root: 'D:\\', unread: 'Exception calling "DriveInfo"' })

  const silent = aPowerShell(printed('', 3))
  expect(await move.theDriveOfAPlace('D:\\mole-office', 'win32', silent.commands)).toEqual({ root: 'D:\\', unread: 'PowerShell ended with 3' })

  const odd = aPowerShell(printed('Floppy'))
  expect(await move.theDriveOfAPlace('D:\\mole-office', 'win32', odd.commands)).toEqual({
    root: 'D:\\',
    unread: 'PowerShell answered "Floppy", which is not a type of drive',
  })
})

it('DF4: the move asks the drive of its place before it stops anything', async () => {
  const move = await theMove()
  const folder = mkdtempSync(join(tmpdir(), 'a-windows-network-place-'))
  folders.push(folder)
  const envFile = join(folder, '.env')
  writeFileSync(envFile, `MOLE_OFFICE_DB=${join(folder, 'data', 'mole-office.db')}\n`)
  const asked: string[] = []
  let stops = 0
  const to = join(folder, 'new-data')

  await expect(
    move.moveTheDataFolder(to, {
      envFile,
      markPath: join(folder, 'data-folder-move.json'),
      stop: async () => {
        stops += 1
        return { ok: true, says: '' }
      },
      start: async () => ({ ok: true, says: '' }),
      theRuntimeDatabase: async () => null,
      theLoginUnit: async () => ({ unit: 'none', unitPath: '', startsAtLogin: false, activeWord: null, fromAnAppImage: false }),
      theDrive: async (place) => {
        asked.push(place)
        throw new Error('the stand-in for the drive was asked')
      },
    }),
  ).rejects.toThrow('the stand-in for the drive was asked')
  expect(asked).toEqual([to])
  expect(stops, 'nothing was stopped before the drive was read').toBe(0)
})

// ============================================================ the installer

/**
 * The installer's theNetworkPathComesFirst, read as the steps its text writes: `StrCpy $R7 $R9 <length> <start>` and
 * LogicLib's `==` and `!=`, which compare text without regard to case.
 */
function theInstallersNetworkAnswer(place: string): boolean {
  const copy = (length: number, start = 0) => place.slice(start, start + length).toLowerCase()
  if (copy(2) !== '\\\\') return false
  const device = copy(2, 2)
  if (device === '?\\' || device === '.\\') return copy(4, 4) === 'unc\\'
  return true
}

it('DF23: the installer tells a UNC path as the move does', async () => {
  const move = await theMove()
  expect(theFunction('theNetworkPathComesFirst')).toBe(
    [
      'Function theNetworkPathComesFirst',
      '  StrCpy $R8 "no"',
      '  StrCpy $R7 $R9 2',
      '  ${If} $R7 != "\\\\"',
      '    Return',
      '  ${EndIf}',
      '  StrCpy $R7 $R9 2 2',
      '  ${If} $R7 == "?\\"',
      '  ${OrIf} $R7 == ".\\"',
      '    StrCpy $R7 $R9 4 4',
      '    ${If} $R7 != "UNC\\"',
      '      Return',
      '    ${EndIf}',
      '  ${EndIf}',
      '  StrCpy $R8 "yes"',
      'FunctionEnd',
    ].join('\n'),
  )

  const places = [
    '\\\\a-server\\a-share\\mole-office',
    '\\\\?\\UNC\\a-server\\a-share\\mole-office',
    '\\\\?\\unc\\a-server\\a-share',
    '\\\\.\\UNC\\a-server\\a-share',
    '\\\\?\\D:\\mole-office',
    '\\\\.\\D:\\mole-office',
    'D:\\mole-office',
    'N:\\mole-office',
    '\\a-folder',
    '//a-server/a-share',
  ]
  for (const place of places) expect(theInstallersNetworkAnswer(place), place).toBe(move.isAWindowsNetworkPath(place))
})

it('DF23: the installer asks GetDriveType after the full-path check and before the temporary folder, and allows only the local types', async () => {
  const move = await theMove()
  const refusal = theFunction('theDataPlaceIsRefused')
  const lines = refusal.split('\n').map((line) => line.trim())
  const at = (line: string) => {
    const index = lines.indexOf(line)
    if (index < 0) throw new Error(`theDataPlaceIsRefused has no line ${line}`)
    return index
  }

  const network = at('Call theNetworkPathComesFirst')
  const fullPath = at('Call theDriveComesFirst')
  const drive = at("System::Call 'kernel32::GetDriveType(t R7) i .R8'")
  const temporary = at('ReadEnvStr $R5 "TEMP"')
  expect(network).toBeLessThan(fullPath)
  expect(fullPath).toBeLessThan(drive)
  expect(drive).toBeLessThan(temporary)
  expect(lines[drive - 1]).toBe('StrCpy $R7 $theDataFolder 3')
  expect(lines[network + 1]).toBe('${If} $R8 == "yes"')
  expect(lines[network + 2]).toContain('because it is a network path')

  // GetDriveType answers 2 for a removable drive, 3 fixed, 4 a network drive, 5 a CD drive and 6 a RAM disk, in the
  // order .NET names the same types.
  const typesInOrder = ['Unknown', 'NoRootDirectory', 'Removable', 'Fixed', 'Network', 'CDRom', 'Ram']
  expect(lines[drive + 1]).toBe(`\${If} $R8 = ${typesInOrder.indexOf('Network')}`)
  expect(lines[drive + 2]).toContain('because Windows reports $R7 as a network drive')

  const allowed: number[] = []
  let line = drive + 5
  expect(lines[line - 1]).toBe('${EndIf}')
  for (; /^\$\{(If|AndIf)\} \$R8 <> \d$/.test(lines[line] ?? ''); line += 1) allowed.push(Number(lines[line]!.slice(-1)))
  expect(allowed.map((type) => typesInOrder[type]).sort()).toEqual([...move.THE_LOCAL_DRIVE_TYPES].sort())
  expect(lines[line]).toContain('because Windows cannot tell what kind of drive $R7 is')
  expect(lines[line + 1]).toBe('Return')

  for (const sentence of [lines[network + 2], lines[drive + 2], lines[line]]) {
    expect(sentence).toContain('write-ahead log')
    expect(sentence).toContain('so the install was refused and nothing was changed')
  }
})
