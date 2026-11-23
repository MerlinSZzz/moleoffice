// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE SETTINGS FOLDER'S REMOVAL: `mole-office settings-folder remove`, which the Windows uninstaller runs when the
 * person leaves its box ticked (scripts/windows-installer.nsi). It removes the office's settings from the per-user
 * folder (thePerUserDataFolder): the .env and its backups, the saved keys, the window's caches and the terminals'
 * files. It never removes data.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT IT KEEPS
 * ---------------------------------------------------------------------------------------------
 *
 * It names what it keeps, and removes every other entry at the top of the folder, so a settings file added later is
 * removed too. An entry is kept when it is one of these places, or holds one:
 *
 *   - the data folder in use, as whereTheDataIs says;
 *   - the default data folder, from the MOLE_OFFICE_DB setting's default;
 *   - every data folder the move's mark names: where the move came from, where it went, and the earlier ones;
 *   - the folder the database marks are kept in (may-a-start-make-the-database.mjs). A mark is what makes a start
 *     refuse to make a new empty database where the office has kept one before;
 *   - the move's mark and the move's log.
 *
 * A folder at the top that holds the database by its default name, or by the name in use, is kept too.
 *
 * Each place is compared as it is written and with every link in it followed, and each entry by both spellings of
 * the settings folder. A settings folder reached through a link would otherwise not hold a data folder written by
 * its real path, and that data folder would be removed.
 *
 * WHEN THE .env's OWN LINE CHOSE THE DATA FOLDER, the .env is written again with that one line, the way
 * `data-folder choose` writes it. Without it, a reinstall is not a first install, because the settings folder still
 * holds the marks, so it shows no data page and starts a new empty office in the default folder. The line holds no
 * key. When the default or the process environment chose the folder, the .env goes whole.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT IT DOES NOT DO
 * ---------------------------------------------------------------------------------------------
 *
 * A link or a junction at the top is removed as a link, and what it points to stays. A removal never follows a link
 * out of the folder.
 *
 * It refuses, and removes nothing, when the settings folder cannot be read, when the data folder in use cannot be
 * told, when that data folder is the settings folder or holds it, when the move's mark cannot be read, and when the
 * mark says a move has not finished. It refuses as well when its .env is not in the settings folder, as in a
 * checkout, because the data folder it would read is then not the one the settings folder's office uses.
 */

import { existsSync, lstatSync, readdirSync, realpathSync, rmSync, unlinkSync } from 'node:fs'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'

import { ENV_FILE, settingNamed, thePerUserDataFolder } from '../settings.mjs'
import { setTheLine } from '../env-file-line.mjs'
import { theMarkOfTheDatabase } from '../may-a-start-make-the-database.mjs'
import {
  THE_STATES_THAT_KEEP_THE_OFFICE_CLOSED,
  isAtOrInside,
  makeTheEnvFile,
  readTheMoveMark,
  theMoveMarkPath,
  theMoverLogPath,
  whereTheDataIs,
} from '../the-data-folder-move.mjs'
import { THIS_PLATFORM, theSameSpelling } from '../the-paths-of-a-system.mjs'

/**
 * What a removal did, or the sentence that says why it removed nothing.
 * @typedef {{ refused: string }
 *   | { folderWasThere: boolean, removed: string[], kept: { name: string, why: string }[], notRemoved: { name: string, why: string }[],
 *       dataFolder: string, lineKept: boolean, lineNotWritten: string | null, afterwards: string }} TheRemoval
 */

/** @param {unknown} error */
const whyOf = (error) => (error instanceof Error ? error.message : String(error))

/**
 * The name of the folder the database marks are kept in, under the settings folder, from the function that names a
 * mark: where a mark is, less where the settings folder is.
 */
function theMarksFolderName() {
  const env = { APPDATA: 'base', HOME: 'base', XDG_CONFIG_HOME: 'base' }
  return relative(thePerUserDataFolder(env), dirname(theMarkOfTheDatabase('mole-office.db', { env })))
}

/**
 * The path with every link in it followed, as far as the path is there, and the rest as it is written.
 * @param {string} path
 */
function theRealSpelling(path) {
  /** @type {string[]} */
  const rest = []
  let at = resolve(path)
  for (;;) {
    try {
      return join(realpathSync.native(at), ...rest)
    } catch {
      // Not there, or not readable: the folder above it is asked.
    }
    const up = dirname(at)
    if (up === at) return resolve(path)
    rest.unshift(basename(at))
    at = up
  }
}

/** A name as the removal prints it: a folder with the separator after it. @param {string} name @param {boolean} folder */
const asPrinted = (name, folder) => (folder ? `${name}${sep}` : name)

/** @param {string} folder @param {string} envFile */
export function theEnvFileIsElsewhereWords(folder, envFile) {
  return `This command removes the settings folder ${folder}, and it reads its settings from ${envFile}, which is not in that folder. So it cannot tell where the office that uses that folder keeps its data, and nothing was removed.`
}

/** @param {string} folder @param {string} why */
export function theSettingsFolderCannotBeReadWords(folder, why) {
  return `The settings folder ${folder} cannot be read (${why}), so nothing was removed.`
}

/** @param {string} folder @param {string} why */
export function theDataFolderCannotBeToldWords(folder, why) {
  return `Mole Office cannot tell where its data folder is (${why}), so nothing was removed from the settings folder ${folder}.`
}

/** @param {string} folder @param {string} dataFolder */
export function theDataFolderHoldsTheSettingsWords(folder, dataFolder) {
  return `The data folder in use, ${dataFolder}, is the settings folder ${folder} or holds it, so nothing was removed: removing the settings would remove data.`
}

/** @param {string} markPath @param {string} why */
export function theMarkCannotBeReadWords(markPath, why) {
  return `The data folder move's mark ${markPath} cannot be read (${why}), so whether a move has not finished is not known, and nothing was removed.`
}

/** @param {string} markPath @param {{ state: string, from: string, to: string }} mark */
export function theMoveHasNotFinishedWords(markPath, mark) {
  return `A data folder move from ${mark.from} to ${mark.to} has not finished: its mark ${markPath} says ${mark.state}. Nothing was removed, so both folders and the settings stay.`
}

/** @param {string} database @param {string} envFile @param {string} why */
export function theLineCannotBeWrittenWords(database, envFile, why) {
  return `The .env line that names the database ${database} could not be written back into ${envFile} (${why}). If Mole Office is installed again, it will not find this data by itself: write MOLE_OFFICE_DB=${database} into that file.`
}

/**
 * The sentence after the data folder, which says what a reinstall finds.
 * @param {'the process environment' | 'the .env line' | 'the default'} chosenBy
 */
export function whatAReinstallFindsWords(chosenBy) {
  if (chosenBy === 'the .env line') return 'If Mole Office is installed again, it finds this data by itself, because the .env keeps the one line that names it.'
  if (chosenBy === 'the process environment') return 'If Mole Office is installed again, it uses this data while the environment variable MOLE_OFFICE_DB names it.'
  return 'If Mole Office is installed again, it finds this data by itself, because this is the default data folder.'
}

/**
 * REMOVE THE SETTINGS FOLDER'S ENTRIES, keeping every place that holds data or guards it. Nothing is removed on a
 * refusal. A name that could not be removed is named, and the rest goes on.
 * @param {{ folder: string, envFile: string, processEnv?: Record<string, string | undefined> }} where
 * @returns {TheRemoval}
 */
export function removeTheSettingsFolder({ folder, envFile, processEnv = process.env }) {
  const platform = THIS_PLATFORM
  if (!theSameSpelling(resolve(dirname(envFile)), resolve(folder), platform)) return { refused: theEnvFileIsElsewhereWords(folder, envFile) }

  /** @type {string[]} */
  let names = []
  let folderWasThere = true
  try {
    names = readdirSync(folder).sort()
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'ENOENT') return { refused: theSettingsFolderCannotBeReadWords(folder, whyOf(error)) }
    folderWasThere = false
  }

  let inUse
  try {
    inUse = whereTheDataIs(processEnv, envFile)
  } catch (error) {
    return { refused: theDataFolderCannotBeToldWords(folder, whyOf(error)) }
  }
  const realFolder = theRealSpelling(folder)
  for (const data of [resolve(inUse.folder), theRealSpelling(inUse.folder)]) {
    if (isAtOrInside(folder, data, platform) || isAtOrInside(realFolder, data, platform)) {
      return { refused: theDataFolderHoldsTheSettingsWords(folder, inUse.folder) }
    }
  }

  const markPath = theMoveMarkPath(envFile)
  const read = readTheMoveMark(markPath)
  if (read.state === 'unreadable') return { refused: theMarkCannotBeReadWords(markPath, read.why) }
  if (read.state === 'read' && (THE_STATES_THAT_KEEP_THE_OFFICE_CLOSED.includes(read.mark.state) || read.mark.state === 'switched' || read.mark.state === 'started')) {
    return { refused: theMoveHasNotFinishedWords(markPath, read.mark) }
  }

  const fallback = String(settingNamed('MOLE_OFFICE_DB').fallback)
  const databaseNames = [...new Set([basename(fallback), inUse.database])]
  /** @type {{ place: string, why: string }[]} */
  const places = [
    { place: inUse.folder, why: 'the data folder in use' },
    { place: dirname(resolve(folder, fallback)), why: 'the default data folder' },
    ...(read.state === 'read' ? [read.mark.from, read.mark.to, ...read.mark.earlier] : []).map((place) => ({ place, why: "a data folder the move's mark names" })),
    { place: join(folder, theMarksFolderName()), why: 'the marks of the places the database has been kept' },
    { place: markPath, why: "the data folder move's mark" },
    { place: theMoverLogPath(markPath), why: "the data folder move's log" },
  ]
  const spelled = places.map(({ place, why }) => ({ spellings: [resolve(place), theRealSpelling(place)], why }))

  /** @type {string[]} */
  const removed = []
  /** @type {{ name: string, why: string }[]} */
  const kept = []
  /** @type {{ name: string, why: string }[]} */
  const notRemoved = []
  for (const name of names) {
    const path = join(folder, name)
    const entries = [path, join(realFolder, name)]
    let stats
    try {
      stats = lstatSync(path)
    } catch (error) {
      notRemoved.push({ name, why: whyOf(error) })
      continue
    }
    const aFolder = stats.isDirectory()
    const printed = asPrinted(name, aFolder)
    const holding = spelled.find(({ spellings }) => spellings.some((one) => entries.some((entry) => isAtOrInside(one, entry, platform))))
    if (holding !== undefined) {
      const itself = holding.spellings.some((one) => entries.some((entry) => theSameSpelling(one, entry, platform)))
      kept.push({ name: printed, why: itself ? holding.why : `it holds ${holding.why}` })
      continue
    }
    const database = aFolder ? databaseNames.find((one) => existsSync(join(path, one))) : undefined
    if (database !== undefined) {
      kept.push({ name: printed, why: `it holds ${database}` })
      continue
    }
    try {
      if (stats.isSymbolicLink()) unlinkSync(path)
      else rmSync(path, { recursive: true, maxRetries: 3 })
      removed.push(printed)
    } catch (error) {
      notRemoved.push({ name: printed, why: whyOf(error) })
    }
  }

  // The .env goes with the rest, and when its own line chose the data folder, that line alone is written back.
  let lineKept = false
  /** @type {string | null} */
  let lineNotWritten = null
  if (inUse.chosenBy === 'the .env line' && !existsSync(envFile)) {
    const database = join(inUse.folder, inUse.database)
    let made = false
    try {
      makeTheEnvFile(envFile)
      made = true
      const written = setTheLine(envFile, 'MOLE_OFFICE_DB', database, 'settings-folder-remove')
      // The backup holds the empty file made just before, so it is not kept.
      rmSync(written.backup, { force: true })
      lineKept = true
    } catch (error) {
      if (made) rmSync(envFile, { force: true })
      lineNotWritten = theLineCannotBeWrittenWords(database, envFile, whyOf(error))
    }
  }

  return { folderWasThere, removed, kept, notRemoved, dataFolder: inUse.folder, lineKept, lineNotWritten, afterwards: whatAReinstallFindsWords(inUse.chosenBy) }
}

/**
 * What the command prints for a removal it made: each name removed, each name kept and why, each name it could not
 * remove, then the data folder in use and what a reinstall finds.
 * @param {Exclude<TheRemoval, { refused: string }>} removal
 * @param {string} folder
 * @returns {string[]}
 */
export function theRemovalInWords(removal, folder) {
  const lines = []
  if (!removal.folderWasThere) lines.push(`The settings folder ${folder} is not there, so there was nothing to remove.`)
  for (const name of removal.removed) lines.push(`Removed ${name}`)
  for (const { name, why } of removal.kept) lines.push(`Kept ${name}: ${why}.`)
  if (removal.lineKept) lines.push('Kept .env with only the line that names the data folder, and no key.')
  for (const { name, why } of removal.notRemoved) lines.push(`Could not remove ${name}: ${why}`)
  if (removal.lineNotWritten !== null) lines.push(removal.lineNotWritten)
  lines.push(`The data folder in use is ${removal.dataFolder}, and nothing in it was removed.`)
  if (removal.lineNotWritten === null) lines.push(removal.afterwards)
  return lines
}

/**
 * THE `settings-folder` VERB: `remove` removes the settings folder's entries, keeping every data folder in it. The
 * command hands in its exit codes and its usage, because it imports this file.
 * @param {string[]} args
 * @param {{ EXIT: { OK: number, FAILED: number, USAGE: number }, USAGE: string }} command
 * @returns {number}
 */
export function settingsFolder(args, { EXIT, USAGE }) {
  if (args.length !== 1 || args[0] !== 'remove') {
    process.stderr.write(`${USAGE}\n`)
    return EXIT.USAGE
  }
  let folder
  try {
    folder = thePerUserDataFolder()
  } catch (error) {
    process.stderr.write(`${whyOf(error)} Nothing was removed.\n`)
    return EXIT.FAILED
  }
  const removal = removeTheSettingsFolder({ folder, envFile: ENV_FILE })
  if ('refused' in removal) {
    process.stderr.write(`${removal.refused}\n`)
    return EXIT.FAILED
  }
  for (const line of theRemovalInWords(removal, folder)) process.stdout.write(`${line}\n`)
  return removal.notRemoved.length === 0 && removal.lineNotWritten === null ? EXIT.OK : EXIT.FAILED
}
