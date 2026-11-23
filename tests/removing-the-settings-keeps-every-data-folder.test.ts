// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * REMOVING THE SETTINGS KEEPS EVERY DATA FOLDER (src/config/systems/the-settings-folder-removal.mjs).
 *
 * The Windows uninstaller offers to remove the office's settings, and when the person leaves its box ticked it runs
 * `mole-office settings-folder remove`. That command removes every entry at the top of the settings folder except the
 * places that hold data or guard it. Each case here makes its own settings folder in a temporary folder, as the
 * per-user folder of a made-up environment, so nothing is written in the home folder.
 *
 * THE CASES:
 *   1. The .env, two of its backups, a secrets file, a cache folder and a terminals folder are all removed.
 *   2. Each kept kind is kept, with its reason: the default data folder, the database marks, the move's mark and
 *      log, the data folders the mark names, a folder that holds a database, and a folder that holds the data
 *      folder in use.
 *   3. A data folder in use inside the settings folder is kept.
 *   4. Each refusal removes nothing: the folder cannot be read, the data folder cannot be told, the data folder is
 *      the settings folder or holds it, the mark cannot be read, the mark says a move has not finished, and the
 *      .env is not in the settings folder.
 *   5. A link at the top is removed as a link, and what it points to stays.
 *   6. When the .env's own line chose the data folder, the .env is written back with that one line and no key, and
 *      the office finds the same data folder from it.
 *   7. The words name each removed and kept entry, a folder with the separator after it, and end with the data
 *      folder in use and what a reinstall finds.
 *   8. The verb is dispatched by the installed command and listed in its usage. From a checkout it refuses.
 *   9. The uninstaller's script: its page comes before its install files page, it reads /SETTINGS=, and it runs the
 *      removal after the stop and before it removes the program's folder.
 */
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, expect, it, vi } from 'vitest'

import { theMarkOfTheDatabase } from '../src/config/may-a-start-make-the-database.mjs'
import { ENV_FILE, envFileValues, settingNamed, thePerUserDataFolder } from '../src/config/settings.mjs'
import {
  removeTheSettingsFolder,
  theDataFolderHoldsTheSettingsWords,
  theEnvFileIsElsewhereWords,
  theMoveHasNotFinishedWords,
  theRemovalInWords,
  whatAReinstallFindsWords,
} from '../src/config/systems/the-settings-folder-removal.mjs'
import {
  THE_STATES_THAT_KEEP_THE_OFFICE_CLOSED,
  theMoveMarkPath,
  theMoverLogPath,
  whereTheDataIs,
  writeTheMoveMark,
} from '../src/config/the-data-folder-move.mjs'
import { EXIT, main } from '../src/config/the-service-command.mjs'

const ROOT = mkdtempSync(join(tmpdir(), 'settings-folder-removal-'))
afterAll(() => rmSync(ROOT, { recursive: true, force: true }))

/** The default database, as the MOLE_OFFICE_DB setting names it, relative to the folder it is read from. */
const THE_DEFAULT_DATABASE = String(settingNamed('MOLE_OFFICE_DB').fallback)
/** The default data folder's name, at the top of the settings folder. */
const THE_DEFAULT_FOLDER = basename(dirname(THE_DEFAULT_DATABASE))

type ASettingsFolder = { folder: string, envFile: string, env: Record<string, string> }
type AMove = Parameters<typeof writeTheMoveMark>[1]

/** A made-up environment whose per-user folder is under a new temporary folder, and that folder's name. */
function aPlace(): ASettingsFolder {
  const base = mkdtempSync(join(ROOT, 'base-'))
  const env = { APPDATA: base, HOME: base, XDG_CONFIG_HOME: base }
  const folder = thePerUserDataFolder(env)
  return { folder, envFile: join(folder, '.env'), env }
}

/** A file holding the text, and the folders above it. */
function aFile(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, text)
}

/** A settings folder holding what an installed office keeps there: the .env, two backups, saved keys, caches, terminals. */
function aSettingsFolder(): ASettingsFolder {
  const at = aPlace()
  aFile(at.envFile, 'A_SAVED_KEY=made-up-for-this-test\nMOLE_OFFICE_PORT=28999\n')
  aFile(join(at.folder, '.env.before-data-folder-choose'), 'A_SAVED_KEY=made-up-for-this-test\n')
  aFile(join(at.folder, '.env.before-data-folder-move'), 'A_SAVED_KEY=made-up-for-this-test\n')
  aFile(join(at.folder, 'secrets.json'), '{"a saved key": "made up for this test"}\n')
  aFile(join(at.folder, 'Cache', 'data_0'), 'a cache entry')
  aFile(join(at.folder, 'terminals', 'one.log'), 'a terminal line')
  return at
}

/** A mark of a data folder move, written as the mover writes it. */
function aMark(at: ASettingsFolder, move: Pick<AMove, 'from' | 'to' | 'state' | 'earlier'>): string {
  return writeTheMoveMark(theMoveMarkPath(at.envFile), {
    ...move,
    database: basename(THE_DEFAULT_DATABASE),
    at: '2026-11-20 19:00:00',
    mover: { pid: 1, startedAt: '2026-11-20 18:59:00' },
    manifest: null,
    says: null,
  })
}

/** Every name under a path, with what each file holds, so a refusal can be shown to have changed nothing. */
function whatIsThere(path: string): string[] {
  if (!lstatSync(path).isDirectory()) return [readFileSync(path, 'utf8')]
  return readdirSync(path, { recursive: true }).map(String).sort().map((name) => {
    const at = join(path, name)
    return lstatSync(at).isFile() ? `${name}: ${readFileSync(at, 'utf8')}` : name
  })
}

/** The removal, which must not be a refusal. */
function removed(at: ASettingsFolder, processEnv: Record<string, string>) {
  const removal = removeTheSettingsFolder({ folder: at.folder, envFile: at.envFile, processEnv })
  if ('refused' in removal) throw new Error(`The removal refused: ${removal.refused}`)
  return removal
}

/** The refusal, after showing that nothing under the settings folder changed. */
function refused(at: ASettingsFolder, processEnv: Record<string, string>, envFile = at.envFile): string {
  const before = whatIsThere(at.folder)
  const removal = removeTheSettingsFolder({ folder: at.folder, envFile, processEnv })
  expect(whatIsThere(at.folder)).toEqual(before)
  if (!('refused' in removal)) throw new Error(`The removal was not refused: it removed ${removal.removed.join(', ')}.`)
  expect(removal.refused).toMatch(/nothing was removed/i)
  return removal.refused
}

it('removes the .env, its backups, the saved keys, the caches and the terminal files, and keeps nothing', () => {
  const at = aSettingsFolder()
  const removal = removed(at, {})
  expect(readdirSync(at.folder)).toEqual([])
  expect([...removal.removed].sort()).toEqual(
    ['.env', '.env.before-data-folder-choose', '.env.before-data-folder-move', `Cache${sep}`, 'secrets.json', `terminals${sep}`].sort(),
  )
  expect(removal.kept).toEqual([])
  expect(removal.notRemoved).toEqual([])
  expect(removal.lineKept).toBe(false)
})

it('keeps each place that holds data or guards it, and says why', () => {
  const at = aSettingsFolder()
  const theDefault = join(at.folder, THE_DEFAULT_DATABASE)
  aFile(theDefault, 'the default database')
  const theMark = theMarkOfTheDatabase(theDefault, { env: at.env })
  aFile(theMark, '{}\n')
  aFile(join(at.folder, 'old-data', 'mole-office.db'), 'where the move came from')
  aFile(join(at.folder, 'earlier-data', 'notes.txt'), 'an earlier data folder')
  const markPath = aMark(at, {
    from: join(at.folder, 'old-data'),
    to: mkdtempSync(join(ROOT, 'moved-to-')),
    state: 'confirmed',
    earlier: [join(at.folder, 'earlier-data')],
  })
  aFile(theMoverLogPath(markPath), 'what the mover printed')
  aFile(join(at.folder, 'a-copy', basename(THE_DEFAULT_DATABASE)), 'a copy of the database')
  const inUse = join(at.folder, 'holder', 'in-use')
  aFile(join(inUse, 'mole-office.db'), 'the database in use')

  const removal = removed(at, { MOLE_OFFICE_DB: join(inUse, 'mole-office.db') })
  expect(Object.fromEntries(removal.kept.map(({ name, why }) => [name, why]))).toEqual({
    [`${THE_DEFAULT_FOLDER}${sep}`]: 'the default data folder',
    [`${basename(dirname(theMark))}${sep}`]: 'the marks of the places the database has been kept',
    [basename(markPath)]: "the data folder move's mark",
    [basename(theMoverLogPath(markPath))]: "the data folder move's log",
    [`old-data${sep}`]: "a data folder the move's mark names",
    [`earlier-data${sep}`]: "a data folder the move's mark names",
    [`a-copy${sep}`]: `it holds ${basename(THE_DEFAULT_DATABASE)}`,
    [`holder${sep}`]: 'it holds the data folder in use',
  })
  expect([...removal.removed].sort()).toEqual(
    ['.env', '.env.before-data-folder-choose', '.env.before-data-folder-move', `Cache${sep}`, 'secrets.json', `terminals${sep}`].sort(),
  )
  expect(removal.notRemoved).toEqual([])
  for (const { name } of removal.kept) expect(existsSync(join(at.folder, name)), name).toBe(true)
  expect(readFileSync(theDefault, 'utf8')).toBe('the default database')
  expect(readFileSync(join(inUse, 'mole-office.db'), 'utf8')).toBe('the database in use')
})

it('keeps a data folder in use that is inside the settings folder', () => {
  const at = aSettingsFolder()
  const inUse = join(at.folder, 'office-data')
  aFile(join(inUse, 'office.db'), 'the database in use')
  const removal = removed(at, { MOLE_OFFICE_DB: join(inUse, 'office.db') })
  expect(removal.kept).toEqual([{ name: `office-data${sep}`, why: 'the data folder in use' }])
  expect(removal.dataFolder).toBe(inUse)
  expect(readFileSync(join(inUse, 'office.db'), 'utf8')).toBe('the database in use')
})

it('refuses, and removes nothing, when the settings folder cannot be read', () => {
  const at = aPlace()
  aFile(at.folder, 'a file where the settings folder should be')
  expect(refused(at, {})).toContain(`The settings folder ${at.folder} cannot be read`)
})

it('refuses, and removes nothing, when the data folder in use cannot be told', () => {
  const at = aSettingsFolder()
  expect(refused(at, { MOLE_OFFICE_DB: '' })).toContain('cannot tell where its data folder is')
})

it('refuses, and removes nothing, when the data folder is the settings folder or holds it', () => {
  const at = aSettingsFolder()
  expect(refused(at, { MOLE_OFFICE_DB: join(at.folder, 'mole-office.db') })).toBe(theDataFolderHoldsTheSettingsWords(at.folder, at.folder))
  const above = dirname(at.folder)
  expect(refused(at, { MOLE_OFFICE_DB: join(above, 'mole-office.db') })).toBe(theDataFolderHoldsTheSettingsWords(at.folder, above))
})

it('refuses, and removes nothing, when the move\'s mark is there and cannot be read', () => {
  const at = aSettingsFolder()
  aFile(theMoveMarkPath(at.envFile), 'not a mark')
  expect(refused(at, {})).toContain(`The data folder move's mark ${theMoveMarkPath(at.envFile)} cannot be read`)
})

it.each([...THE_STATES_THAT_KEEP_THE_OFFICE_CLOSED, 'switched' as const, 'started' as const])(
  'refuses, and removes nothing, while the move\'s mark says %s',
  (state) => {
    const at = aSettingsFolder()
    const move = { from: join(at.folder, 'old-data'), to: mkdtempSync(join(ROOT, 'moving-to-')), state, earlier: [] }
    const markPath = aMark(at, move)
    expect(refused(at, {})).toBe(theMoveHasNotFinishedWords(markPath, move))
  },
)

it('refuses, and removes nothing, when the .env it would read is not in the settings folder', () => {
  const at = aSettingsFolder()
  const elsewhere = join(mkdtempSync(join(ROOT, 'a-checkout-')), '.env')
  expect(refused(at, {}, elsewhere)).toBe(theEnvFileIsElsewhereWords(at.folder, elsewhere))
})

it('removes a link at the top as a link, and leaves what it points to', (context) => {
  const at = aSettingsFolder()
  const target = mkdtempSync(join(ROOT, 'a-link-points-here-'))
  aFile(join(target, 'mole-office.db'), 'not the settings folder\'s to remove')
  try {
    symlinkSync(target, join(at.folder, 'a-link'), 'junction')
  } catch (error) {
    context.skip(`This system refuses to make a link here (${(error as NodeJS.ErrnoException).code}), so a link at the top cannot be tried.`)
    return
  }
  const removal = removed(at, {})
  expect(removal.removed).toContain('a-link')
  expect(readdirSync(at.folder)).toEqual([])
  expect(readdirSync(target)).toEqual(['mole-office.db'])
  expect(readFileSync(join(target, 'mole-office.db'), 'utf8')).toBe('not the settings folder\'s to remove')
})

it('writes the .env back with only the line that names a data folder the .env chose, and no key', () => {
  const at = aSettingsFolder()
  const chosen = mkdtempSync(join(ROOT, 'chosen-'))
  const database = join(chosen, 'mole-office.db')
  writeFileSync(at.envFile, `A_SAVED_KEY=made-up-for-this-test\nMOLE_OFFICE_DB=${database}\n`)
  const before = whereTheDataIs({}, at.envFile)
  expect(before.chosenBy).toBe('the .env line')

  const removal = removed(at, {})
  expect(removal.lineKept).toBe(true)
  expect(removal.lineNotWritten).toBeNull()
  expect(readdirSync(at.folder)).toEqual(['.env'])
  expect(envFileValues(at.envFile)).toEqual({ MOLE_OFFICE_DB: database })
  expect(readFileSync(at.envFile, 'utf8').split(/\r?\n/).filter((line) => line.trim() !== '')).toHaveLength(1)
  if (process.platform !== 'win32') expect(statSync(at.envFile).mode & 0o777).toBe(0o600)
  expect(whereTheDataIs({}, at.envFile)).toEqual(before)
  const words = theRemovalInWords(removal, at.folder)
  expect(words).toContain('Kept .env with only the line that names the data folder, and no key.')
  expect(words.at(-1)).toBe(whatAReinstallFindsWords('the .env line'))
})

it('says each name it removed and kept, a folder with the separator after it, and last the data folder in use', () => {
  const at = aSettingsFolder()
  aFile(join(at.folder, THE_DEFAULT_DATABASE), 'the default database')
  const removal = removed(at, {})
  const words = theRemovalInWords(removal, at.folder)
  expect(words).toContain(`Removed Cache${sep}`)
  expect(words).toContain('Removed secrets.json')
  expect(words).toContain(`Kept ${THE_DEFAULT_FOLDER}${sep}: the default data folder.`)
  expect(words.slice(-2)).toEqual([
    `The data folder in use is ${removal.dataFolder}, and nothing in it was removed.`,
    whatAReinstallFindsWords('the default'),
  ])
  const absent = aPlace()
  expect(theRemovalInWords(removed(absent, {}), absent.folder)[0]).toBe(
    `The settings folder ${absent.folder} is not there, so there was nothing to remove.`,
  )
})

it('is a verb of the installed command, listed in its usage, and refuses from a checkout, whose .env is elsewhere', async () => {
  const at = aPlace()
  aFile(join(at.folder, 'secrets.json'), '{}\n')
  const saved = { APPDATA: process.env['APPDATA'], HOME: process.env['HOME'], XDG_CONFIG_HOME: process.env['XDG_CONFIG_HOME'] }
  const said: string[] = []
  const stderr = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown): boolean => { said.push(String(chunk)); return true })
  try {
    Object.assign(process.env, at.env)
    expect(await main(['settings-folder', 'remove'])).toBe(EXIT.FAILED)
    expect(said.join('')).toBe(`${theEnvFileIsElsewhereWords(at.folder, ENV_FILE)}\n`)
    expect(readdirSync(at.folder)).toEqual(['secrets.json'])
    said.length = 0
    expect(await main(['settings-folder'])).toBe(EXIT.USAGE)
    expect(said.join('')).toContain('\n  settings-folder remove ')
  } finally {
    stderr.mockRestore()
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
})

it("lets the uninstaller ask on its own page or by /SETTINGS=, and removes the settings after the stop and before the program's folder", () => {
  const words = (text: string): string => text.trim().replace(/\s+/g, ' ')
  const script = readFileSync(fileURLToPath(new URL('../scripts/windows-installer.nsi', import.meta.url)), 'utf8')
  const CODE = script.split('\n').filter((line) => !line.trimStart().startsWith(';')).join('\n')

  expect(CODE.indexOf('\nUninstPage custom un.theSettingsPage un.theSettingsPageLeave\n')).toBeGreaterThan(-1)
  expect(CODE.indexOf('\nUninstPage custom un.theSettingsPage un.theSettingsPageLeave\n')).toBeLessThan(CODE.indexOf('\nUninstPage instfiles\n'))

  const init = CODE.slice(CODE.indexOf('Function un.onInit\n'), CODE.indexOf('FunctionEnd', CODE.indexOf('Function un.onInit\n')))
  expect(words(init)).toContain(words([
    'StrCpy $theSettings "remove"',
    '${un.GetParameters} $R0',
    'ClearErrors',
    '${un.GetOptions} $R0 "/SETTINGS=" $R1',
    '${IfNot} ${Errors}',
    '${If} $R1 == "keep"',
    'StrCpy $theSettings "keep"',
    '${ElseIf} $R1 != "remove"',
    '!insertmacro theRefusal "The uninstaller takes /SETTINGS=keep or /SETTINGS=remove',
  ].join(' ')))

  const start = CODE.indexOf('Section "Uninstall"')
  const uninstall = CODE.slice(start, CODE.indexOf('SectionEnd', start))
  const stopped = uninstall.indexOf('Call un.theStop')
  const removing = uninstall.indexOf('settings-folder remove`')
  expect(stopped).toBeGreaterThan(-1)
  expect(removing).toBeGreaterThan(stopped)
  expect(uninstall.indexOf('RMDir /r "$INSTDIR"')).toBeGreaterThan(removing)
  expect(words(uninstall)).toContain(words([
    '${If} $theSettings == "remove"',
    'SetOutPath "$INSTDIR\\${THE_OFFICE}"',
    'nsExec::ExecToStack /TIMEOUT=${THE_REMOVING_WAIT_MS} `"$INSTDIR\\${THE_NODE}" "$INSTDIR\\${THE_COMMAND}" settings-folder remove`',
    'Pop $1',
    'Pop $2',
    'SetOutPath "$TEMP"',
    'DetailPrint "$2"',
    '${If} $1 != 0',
    'StrCpy $theSettingsLeft "yes"',
    'FileOpen $3 "${THE_SETTINGS_NOT_REMOVED}" w',
  ].join(' ')))
  expect(uninstall).toMatch(/MessageBox MB_OK\|MB_ICONEXCLAMATION "Not all of [^\n]+" \/SD IDOK\n/)
  expect(CODE).toMatch(/^!define THE_SETTINGS_NOT_REMOVED "\$TEMP\\\$\{PRODUCT_FILENAME\}-settings-not-removed\.txt"$/m)
  expect(CODE).toMatch(/^!define THE_SETTINGS_LEFT 3$/m)
  expect(words(uninstall.slice(uninstall.indexOf('DeleteRegKey')))).toContain('${If} $theSettingsLeft == "yes" SetErrorLevel ${THE_SETTINGS_LEFT} ${EndIf}')
})
