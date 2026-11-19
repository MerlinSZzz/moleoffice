// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE MAIL TOOL'S PLACE ON THIS COMPUTER, AND THE PRESS THAT PUTS IT THERE. Point (i) of a decision of 27 September
 * 2026: a press on the Settings page installs the mail tool (tools/mail-the-summonses.mjs) as a service of their own
 * login, which starts now and at each login; the office starts nothing itself afterwards.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE PRESS WRITES, AND NOTHING ELSE
 * ---------------------------------------------------------------------------------------
 *
 *   · the tool's folder, ~/.local/state/mole-office/mail-the-summonses, mode 700, and in it the tool's key, mode 600,
 *     when the office has just given the tool one (src/server/lib/mailtool.ts makes their personal tool key);
 *   · one systemd user unit, ~/.config/systemd/user/mole-office-mail-the-summonses.service, which runs this checkout's
 *     tool with the node this office runs on and names the office's address and the folder;
 *
 * and then it asks systemd, as them, to read the unit again and to start the service, now and at each login.
 *
 * ---------------------------------------------------------------------------------------
 * A SECOND PRESS, AND A UNIT IT DID NOT WRITE
 * ---------------------------------------------------------------------------------------
 *
 * A second press writes nothing when the unit is the one it would write and the service runs, and says so. A unit it
 * wrote that differs, because the office moved or node did, is copied beside itself first, under the first backup name
 * nothing has, and written again, and the service restarted. A file of that name this press did not write is refused
 * and left as it is: the entry press's rule, which merges or refuses and never guesses
 * (src/config/install-the-entry.mjs). Everything is checked before anything is written, so a refusal changes nothing.
 *
 * THE HOME FOLDER IS THE SERVER'S OWN (theOwnersHome in install-the-entry.mjs) and never the request's, so the door is
 * no way to write anywhere else on their disk. The folder is the same one the tool finds by itself (theMailToolFolder),
 * and the unit names it to the tool as well, so the office reads the page's address from where the tool writes it.
 *
 * ---------------------------------------------------------------------------------------
 * THE PRESS THAT TURNS IT OFF, WITHOUT UNINSTALLING IT
 * ---------------------------------------------------------------------------------------
 *
 * A decision, of 28 September 2026, says the mail tool gains a Disable press that stops it without
 * uninstalling. systemd stops the service and no longer starts it at their login; the unit, the
 * tool's folder with its key, and its settings stay, so the install press turns it back on. Coming back, it mails
 * nothing made while it was off: its place says to start after the newest summons, as on its first start, and the
 * office keeps every summons as a message either way. A unit this press did not write is left alone.
 */

import { execFileSync } from 'node:child_process'
import { chmodSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join } from 'node:path'
import { copyUnderAFreeName, takeTheCopyAway } from './a-backup-under-a-free-name.mjs'
import { theLocalAppDataFolder, thePathsOf } from './the-paths-of-a-system.mjs'
import { thisSystem } from './systems/the-system.mjs'

/** The service's name, as systemd knows it. */
export const THE_MAIL_TOOL_UNIT = 'mole-office-mail-the-summonses.service'

/** Their tool’s name, also the handle of the old agent until their install press moves it. */
export const THE_MAIL_TOOL_HANDLE = 'mail-tool'

/** The first line of every unit this press writes: how a second press knows the file is its own. */
export const THE_MAIL_TOOL_UNIT_MARK = '# Written by the press "Install the mail tool" on the Mole Office Settings page. A second press writes it again.'

/** The suffix of a unit's first copy, made before the press writes it again. A later copy adds -2, -3 and on. */
export const THE_MAIL_TOOL_BACKUP_SUFFIX = '.mole-office-backup'

/**
 * WHAT THE TOOL'S PLACE SAYS AFTER THE PRESS THAT TURNS IT OFF: start after the newest summons, as on its first start.
 * No summons id has a space in it, so the tool never reads this as one.
 */
export const THE_PLACE_AFTER_THE_NEWEST = 'after the newest'

/**
 * THE TOOL'S FOLDER: MAIL_TOOL_DIR, or its place under this user's state folder. On Windows that folder is
 * %LOCALAPPDATA%, and AppData\Local under the home when it is not set, as XDG_STATE_HOME is ~/.local/state here.
 * @param {NodeJS.ProcessEnv} env
 * @param {string} home
 * @param {string} [platform] a value of `process.platform`, this system's unless a test names another
 */
export function theMailToolFolder(env = process.env, home = homedir(), platform = process.platform) {
  const named = env['MAIL_TOOL_DIR']
  if (typeof named === 'string' && named !== '') return thePathsOf(platform).resolve(named)
  if (platform === 'win32') return thePathsOf(platform).join(theLocalAppDataFolder(env, home), 'mole-office', 'mail-the-summonses')
  const state = env['XDG_STATE_HOME']
  return join(typeof state === 'string' && state !== '' ? state : join(home, '.local', 'state'), 'mole-office', 'mail-the-summonses')
}

/**
 * Where the unit is written, under their home folder.
 * @param {string} home
 */
export function theMailToolUnitPath(home) {
  return join(home, '.config', 'systemd', 'user', THE_MAIL_TOOL_UNIT)
}

/**
 * One word of a unit's line, quoted as systemd reads it: a `%` is a specifier there and a `$` names a variable, so each
 * is doubled, and a quote or a backslash is escaped inside the quotes (problem IsUk8C9iqVLV: `$` was left as it was).
 * The start-at-login unit (src/config/start-at-login.mjs) quotes its words with this one too.
 * @param {string} word
 */
export function quoted(word) {
  return `"${word.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/%/g, '%%').replace(/\$/g, '$$$$')}"`
}

/**
 * THE UNIT'S TEXT: the tool, run by `node`, told the office's address and its folder; restarted when it fails, and
 * started at each login.
 * `environment` is what that Node needs set as well (`theInstallsNode` in ./settings.mjs), one line each after the folder.
 * @param {{ node: string, tool: string, api: string, dir: string, environment?: Record<string, string> }} input
 */
export function theMailToolUnit(input) {
  return [
    THE_MAIL_TOOL_UNIT_MARK,
    '[Unit]',
    'Description=Mole Office: mail each summons (tools/mail-the-summonses.mjs)',
    '',
    '[Service]',
    'Type=simple',
    `ExecStart=${quoted(input.node)} ${quoted(input.tool)}`,
    `Environment=${quoted(`MOLE_OFFICE_API=${input.api}`)}`,
    `Environment=${quoted(`MAIL_TOOL_DIR=${input.dir}`)}`,
    ...Object.entries(input.environment ?? {}).map(([name, value]) => `Environment=${quoted(`${name}=${value}`)}`),
    'Restart=on-failure',
    'RestartSec=30',
    '',
    '[Install]',
    'WantedBy=default.target',
    '',
  ].join('\n')
}

/**
 * WHETHER A UNIT IS THE ONE THIS OFFICE'S PRESS WROTE FOR THIS OFFICE: the press's mark on its first line, and this
 * office's own address in it, as theMailToolUnit writes it (problem c-6HsJmIsYE3: the page's address was handed out for
 * any unit that ran).
 * @param {string} text
 * @param {string} api
 */
export function theUnitIsThisOfficesOwn(text, api) {
  return text.startsWith(THE_MAIL_TOOL_UNIT_MARK) && text.split('\n').includes(`Environment=${quoted(`MOLE_OFFICE_API=${api}`)}`)
}

/**
 * @typedef {(args: string[]) => { code: number, out: string, err: string }} Systemctl
 * @typedef {{ ok: false, says: string, code?: 'mailToolUnderAFile', path?: string }} TheRefusal
 * @typedef {{ ok: true, says: string, wrote: string[], service: 'started' | 'restarted' | 'already running' } | TheRefusal} TheInstall
 * @typedef {{ ok: true, says: string, service: 'turned off' | 'already off' } | TheRefusal} TheDisable
 */

/**
 * `systemctl --user`, as them: what it printed, and its exit code.
 * @type {Systemctl}
 */
export function theSystemctl(args) {
  try {
    const out = execFileSync('systemctl', ['--user', ...args], { encoding: 'utf8', timeout: 20_000, stdio: ['ignore', 'pipe', 'pipe'] })
    return { code: 0, out, err: '' }
  } catch (err) {
    const failed = /** @type {{ status?: number | null, stdout?: string, stderr?: string, message?: string }} */ (err)
    return { code: typeof failed.status === 'number' ? failed.status : 1, out: String(failed.stdout ?? ''), err: String(failed.stderr ?? failed.message ?? '') }
  }
}

/**
 * WHAT SYSTEMD SAYS OF THE TOOL AT THEIR LOGIN: the word `systemctl --user is-enabled` printed ("enabled", "disabled",
 * "enabled-runtime", ...), or null when it printed nothing.
 * @param {Systemctl} run
 * @returns {string | null}
 */
function whatSystemdSaysAtLogin(run) {
  const said = run(['is-enabled', THE_MAIL_TOOL_UNIT]).out.trim()
  return said === '' ? null : said
}

/**
 * WHETHER SYSTEMD STARTS THE TOOL AT THEIR LOGIN: true when it is enabled, for good or for this boot ("enabled-runtime");
 * false when it is disabled; null for anything else systemd says, or nothing. THE ONE READING OF IT (problem
 * 4U_5cC8TozAI): the press that turns the tool off and their read of the tool both ask this, where each once worked it out
 * on its own and the two answered "enabled-runtime" differently.
 * @param {Systemctl} run
 * @returns {boolean | null}
 */
export function theToolStartsAtLogin(run) {
  const said = whatSystemdSaysAtLogin(run)
  return said === 'enabled' || said === 'enabled-runtime' ? true : said === 'disabled' ? false : null
}

/**
 * A PATH THAT CANNOT BE READ BECAUSE A FILE STANDS WHERE ONE OF ITS FOLDERS GOES (wave 13t, round W28). `file` is that
 * file, and the cause is what reading the path said.
 */
export class UnderAFile extends Error {
  /**
   * @param {string} path
   * @param {string} file
   * @param {unknown} cause
   */
  constructor(path, file, cause) {
    super(`${path} cannot be read, because ${file} is a file, not a folder`, { cause })
    this.path = path
    this.file = file
  }
}

/**
 * The file that stands where a folder of `path` goes: the nearest of its folders that is there, when that is not a
 * folder. Null when the nearest one there is a folder.
 * @param {string} path
 * @returns {string | null}
 */
function theFileInTheWay(path) {
  for (let at = dirname(path); at !== dirname(at); at = dirname(at)) {
    const found = statSync(at, { throwIfNoEntry: false })
    if (found !== undefined) return found.isDirectory() ? null : at
  }
  return null
}

/**
 * A file's text, or null when it is not there. A path under a file, not a folder, is neither: it throws UnderAFile,
 * naming that file, and each press refuses with its own code (round W28). Any other error is thrown as it is.
 * @param {string} path
 */
export function readOrNull(path) {
  try {
    return readFileSync(path, 'utf8')
  } catch (err) {
    const code = /** @type {NodeJS.ErrnoException} */ (err).code
    if (code === 'ENOENT') return null
    const file = code === 'ENOTDIR' ? theFileInTheWay(path) : null
    if (file !== null) throw new UnderAFile(path, file, err)
    throw err
  }
}

/** What an error said, for a sentence. */
const said = (/** @type {unknown} */ e) => (e instanceof Error ? e.message : String(e))

/**
 * A WRITE THAT FAILED AND LEFT THE FILE IT MADE BESIDE ITS PATH, because that file could not be removed either (wave
 * 13t, rounds W27 and W28). Its words say what stopped the write, without a second full stop, and where the file still
 * is. `beside` is that file, and the cause is what stopped the write.
 */
export class TheFileBesideIsLeft extends Error {
  /**
   * @param {unknown} err what stopped the write
   * @param {string} beside
   * @param {unknown} left what the removal said
   */
  constructor(err, beside, left) {
    super(`${said(err).replace(/\.$/u, '')}. The file this write made beside it could not be removed, and is still at ${beside} (${said(left)})`, { cause: err })
    this.beside = beside
  }
}

/**
 * TAKE AWAY THE FILE A FAILED WRITE MADE BESIDE ITS PATH, and throw what stopped the write. When that file cannot be
 * taken away either, throw TheFileBesideIsLeft. writeWhole and writeTheKeyWhole both end a failed write here, so
 * neither lets the removal's error take the place of the first (round W28).
 * @param {string} beside
 * @param {unknown} err what stopped the write
 * @returns {never}
 */
function takeTheFileBesideAway(beside, err) {
  try {
    rmSync(beside, { force: true })
  } catch (left) {
    throw new TheFileBesideIsLeft(err, beside, left)
  }
  throw err
}

/**
 * A file written whole through a rename, so nothing ever reads half of it. When the write, its mode or the rename
 * fails, the file this write made beside the path is taken away, and the error is the one that stopped the write. When
 * that file cannot be taken away either, the error says so and where it still is (wave 13t, round W27).
 * @param {string} path
 * @param {string} text
 * @param {number} mode
 */
export function writeWhole(path, text, mode) {
  const beside = `${path}.${String(process.pid)}.new`
  // Opened before the write, so what this write never opened, such as a folder at that name, is never taken away.
  const made = openSync(beside, 'w', mode)
  try {
    try {
      writeFileSync(made, text)
    } finally {
      closeSync(made)
    }
    chmodSync(beside, mode)
    renameSync(beside, path)
  } catch (err) {
    takeTheFileBesideAway(beside, err)
  }
}

/**
 * WRITE A SYSTEMD UNIT, AND COPY THE ONE IT REPLACES FIRST, under the first backup name nothing has (wave 13t, round
 * W26). The mail tool's press and start at login's press both write their unit this way, so neither writes over the
 * person's first backup. A copy that fails refuses, and the unit is not written. A write that fails after the copy
 * takes the copy away, or says where it still is. Its refusal also says whether the file the write made beside the
 * unit is left, and names it: with the copy, or alone (round W29).
 * @param {string} unitPath
 * @param {string} text
 * @param {string | null} before the unit as it is now, or null when there is none
 * @param {string} firstBackupPath
 * @param {(path: string, text: string, mode: number) => void} [write] writeWhole, or a test's stand-in for a failed
 *   write that keeps one of the copy and the file beside and not the other, which no folder can be made to give
 * @returns {{ ok: true, wrote: string[] } | { ok: false, refused: 'the copy' | 'the write' | 'the write, and the copy is left' | 'the write, and the file beside is left', path: string, says: string } | { ok: false, refused: 'the write, and the copy and the file beside are left', path: string, beside: string, says: string }}
 */
export function writeTheUnit(unitPath, text, before, firstBackupPath, write = writeWhole) {
  if (before === null) {
    write(unitPath, text, 0o644)
    return { ok: true, wrote: [] }
  }
  const copied = copyUnderAFreeName(unitPath, firstBackupPath)
  if ('failed' in copied) {
    return {
      ok: false,
      refused: 'the copy',
      path: copied.path,
      says: `The unit this press wrote before could not be backed up, so it was not written again: ${copied.path} (${String(copied.failed)}).`,
    }
  }
  try {
    write(unitPath, text, 0o644)
  } catch (err) {
    const copyLeft = takeTheCopyAway(copied.path)
    const says = `${unitPath} could not be written, so it was left as it was: ${String(err)}.${copyLeft}`
    const beside = err instanceof TheFileBesideIsLeft ? err.beside : null
    if (copyLeft !== '' && beside !== null) return { ok: false, refused: 'the write, and the copy and the file beside are left', path: copied.path, beside, says }
    if (copyLeft !== '') return { ok: false, refused: 'the write, and the copy is left', path: copied.path, says }
    if (beside !== null) return { ok: false, refused: 'the write, and the file beside is left', path: beside, says }
    return { ok: false, refused: 'the write', path: unitPath, says }
  }
  const first = copied.path === firstBackupPath ? '' : ` (the first backup, at ${firstBackupPath}, was not changed)`
  return { ok: true, wrote: [`the unit it wrote before, copied to ${copied.path}${first}`] }
}

/**
 * THE TOOL'S KEY, WRITTEN WHOLE AND ONLY THIS USER'S. On Linux and the Mac it is writeWhole with mode 600. On Windows the
 * file beside is made empty, its access list made this user's alone and read back, and only then is the key written into
 * it and the file renamed. When the list cannot be set, the file beside is removed and the key is not written. When that
 * file cannot be removed either, the error still says what stopped the write first, and then where the file is. So its
 * words no longer say that nothing was changed (round W28).
 * @param {string} path
 * @param {string} text
 * @param {import('./systems/the-system.mjs').AFileIsMadePrivate} [privately] this system's way, unless a test names another
 */
export function writeTheKeyWhole(path, text, privately = thisSystem().aFileIsMadePrivate) {
  if (privately.by === 'its-mode') {
    writeWhole(path, text, 0o600)
    return
  }
  const beside = `${path}.${String(process.pid)}.new`
  writeFileSync(beside, '')
  try {
    const did = privately.set(beside)
    if (!did.ok) {
      throw new Error(`The mail tool's key was not written to ${path}, so it was left as it was: the file it goes through could not be made one that only this user may read and write (${did.says}).`)
    }
    writeFileSync(beside, text, { flag: 'r+' })
    renameSync(beside, path)
  } catch (err) {
    takeTheFileBesideAway(beside, err)
  }
}

/**
 * The first line systemd printed, for a sentence.
 * @param {{ out: string, err: string }} said
 */
export function firstLineOf(said) {
  return (said.err.split('\n').find((line) => line.trim() !== '') ?? said.out.split('\n').find((line) => line.trim() !== '') ?? 'nothing').trim().slice(0, 200)
}

/**
 * The service's text, or null when it is not there; or, when a file stands where a folder of its path goes, the
 * refusal both presses give, with its code and that file (round W28). Any other error is thrown.
 * @param {string} unitPath
 * @returns {{ ok: true, text: string | null } | TheRefusal}
 */
function readTheService(unitPath) {
  try {
    return { ok: true, text: readOrNull(unitPath) }
  } catch (err) {
    if (!(err instanceof UnderAFile)) throw err
    return {
      ok: false,
      code: 'mailToolUnderAFile',
      path: err.file,
      says: `${err.file} is a file, not a folder, so the mail tool's service at ${unitPath} cannot be read or written. Nothing was changed. Move that file aside, and press again.`,
    }
  }
}

/**
 * WHAT THE PRESS WOULD WRITE, OR WHY IT MAY NOT: asked before anything is written, and before the office gives the
 * tool a key, so a refusal leaves no agent and no file behind.
 * @param {{ home: string, node: string, checkout: string, systemctl?: Systemctl }} input
 * @returns {{ ok: true } | TheRefusal}
 */
export function mayTheMailToolBeInstalled(input) {
  const run = input.systemctl ?? theSystemctl
  const tool = join(input.checkout, 'tools', 'mail-the-summonses.mjs')
  if (!existsSync(tool)) return { ok: false, says: `This checkout has no ${tool}, so there is no mail tool to install. Nothing was written.` }
  if (!isAbsolute(input.node) || !existsSync(input.node)) {
    return { ok: false, says: `The node this office runs on (${input.node}) is not a file this press can name in the service. Nothing was written.` }
  }
  const unitPath = theMailToolUnitPath(input.home)
  const read = readTheService(unitPath)
  if (!read.ok) return read
  const before = read.text
  if (before !== null && !before.startsWith(THE_MAIL_TOOL_UNIT_MARK)) {
    return {
      ok: false,
      says:
        `${unitPath} is already there and this press did not write it, so it was left as it is and nothing was written. ` +
        'Move it aside, or tell a secretary what it is for, and press again.',
    }
  }
  const systemd = run(['show-environment'])
  if (systemd.code !== 0) {
    return {
      ok: false,
      says: `systemd does not answer for your login on this computer (${firstLineOf(systemd)}), so the mail tool cannot run as a service here. Nothing was written.`,
    }
  }
  return { ok: true }
}

/**
 * SAVE THEIR TOOL'S KEY WHOLE, so each round reads either key and never half a key. The install
 * transaction uses this before retirement; key changes need no service restart (theKey reads
 * every round). Two decisions and H-forI_Vk5H7 change an earlier
 * decision.
 * @param {string} home
 * @param {string} key
 */
export function saveTheMailToolsKey(home, key) {
  const dir = theMailToolFolder({}, home)
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  chmodSync(dir, 0o700)
  writeTheKeyWhole(join(dir, 'key'), `${key}\n`)
}

/**
 * INSTALL THE MAIL TOOL: its folder and its key when it has just been given one, the unit, and the service started or
 * restarted. Asks mayTheMailToolBeInstalled first, and writes nothing on its refusal.
 * @param {{ home: string, node: string, environment?: Record<string, string>, checkout: string, api: string, key: string | null, systemctl?: Systemctl }} input
 * @returns {TheInstall}
 */
export function installTheMailTool(input) {
  const run = input.systemctl ?? theSystemctl
  const may = mayTheMailToolBeInstalled({ ...input, systemctl: run })
  if (!may.ok) return may
  const dir = theMailToolFolder({}, input.home)
  const unitPath = theMailToolUnitPath(input.home)
  const text = theMailToolUnit({ node: input.node, tool: join(input.checkout, 'tools', 'mail-the-summonses.mjs'), api: input.api, dir, environment: input.environment })
  const before = readOrNull(unitPath)
  /** @type {string[]} */
  const wrote = []
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  chmodSync(dir, 0o700)
  if (input.key !== null) {
    writeTheKeyWhole(join(dir, 'key'), `${input.key}\n`)
    wrote.push(`the tool's key, into ${join(dir, 'key')}`)
  }
  const unitChanged = before !== text
  if (unitChanged) {
    mkdirSync(dirname(unitPath), { recursive: true })
    const unit = writeTheUnit(unitPath, text, before, `${unitPath}${THE_MAIL_TOOL_BACKUP_SUFFIX}`)
    if (!unit.ok) return { ok: false, says: wrote.length === 0 ? unit.says : `${wrote.join('; ')} were written. ${unit.says}` }
    wrote.push(...unit.wrote, `the service, into ${unitPath}`)
    const reloaded = run(['daemon-reload'])
    if (reloaded.code !== 0) {
      return { ok: false, says: `${wrote.join('; ')} were written, and then systemd would not read the unit again (${firstLineOf(reloaded)}). Press again.` }
    }
  }
  const active = run(['is-active', THE_MAIL_TOOL_UNIT]).out.trim() === 'active'
  // ENABLED FOR GOOD, NOT ONLY FOR THIS BOOT: the press promises that it starts at each login, so a unit enabled with
  // --runtime is enabled again. This is its own question, not whether the tool starts at their next login.
  const enabledForGood = whatSystemdSaysAtLogin(run) === 'enabled'
  /** @type {'started' | 'restarted' | 'already running'} */
  let service = 'already running'
  if (!active || !enabledForGood) {
    const started = run(['enable', '--now', THE_MAIL_TOOL_UNIT])
    if (started.code !== 0) return { ok: false, says: `${wrote.length === 0 ? 'Nothing was written' : `${wrote.join('; ')} were written`}, and then systemd would not start the service (${firstLineOf(started)}).` }
    service = 'started'
  } else if (unitChanged) {
    const restarted = run(['restart', THE_MAIL_TOOL_UNIT])
    if (restarted.code !== 0) return { ok: false, says: `${wrote.join('; ')} were written, and then systemd would not restart the service (${firstLineOf(restarted)}).` }
    service = 'restarted'
  }
  const says =
    wrote.length === 0 && service === 'already running'
      ? 'The mail tool is installed and running, as it was, so nothing was written.'
      : `${wrote.length === 0 ? 'Nothing was written' : `Written: ${wrote.join('; ')}`}. The service ${service === 'started' ? 'was started, and starts at each login' : service === 'restarted' ? 'was restarted' : 'was already running'}.`
  return { ok: true, says, wrote, service }
}

/**
 * TURN THE MAIL TOOL OFF, WITHOUT UNINSTALLING IT: systemd stops the service and no longer starts it at their login, and
 * then its place is set to start after the newest summons. Only a unit this press wrote is touched, and the place is
 * written only once systemd has stopped the tool, so a running tool never writes over it.
 * @param {{ home: string, systemctl?: Systemctl }} input
 * @returns {TheDisable}
 */
export function disableTheMailTool(input) {
  const run = input.systemctl ?? theSystemctl
  const unitPath = theMailToolUnitPath(input.home)
  const read = readTheService(unitPath)
  if (!read.ok) return read
  const text = read.text
  if (text === null) return { ok: false, says: 'The mail tool is not installed, so there is nothing to turn off. Nothing was changed.' }
  if (!text.startsWith(THE_MAIL_TOOL_UNIT_MARK)) {
    return { ok: false, says: `${unitPath} is there and the install press did not write it, so this press leaves it alone. Nothing was changed.` }
  }
  const wasOn = run(['is-active', THE_MAIL_TOOL_UNIT]).out.trim() === 'active' || theToolStartsAtLogin(run) === true
  const off = run(['disable', '--now', THE_MAIL_TOOL_UNIT])
  if (off.code !== 0) return { ok: false, says: `systemd would not turn the service off (${firstLineOf(off)}). The tool's place was left as it was.` }
  const dir = theMailToolFolder({}, input.home)
  if (existsSync(dir)) writeWhole(join(dir, 'place'), `${THE_PLACE_AFTER_THE_NEWEST}\n`, 0o600)
  return {
    ok: true,
    service: wasOn ? 'turned off' : 'already off',
    says:
      `${wasOn ? 'The mail tool was turned off' : 'The mail tool was already off'}: it does not run, and does not start at ` +
      'your login. Its service, its key and its settings stay, so the install press turns it back on; coming back, ' +
      'it mails nothing made while it was off.',
  }
}

/**
 * WHERE THE TOOL ANSWERS, from what the running tool wrote into its folder, or null while it has not written it. The
 * address carries the tool's secret, so only their own door hands it out, to their Settings page.
 * @param {string} dir
 * @returns {string | null}
 */
export function theMailToolPage(dir) {
  const page = readOrNull(join(dir, 'page.json'))
  const secret = (readOrNull(join(dir, 'page-secret')) ?? '').trim()
  if (page === null || secret === '') return null
  let port = 0
  try {
    port = Number(/** @type {{ port?: unknown }} */ (JSON.parse(page)).port)
  } catch {
    return null
  }
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return null
  return `http://127.0.0.1:${String(port)}/?s=${encodeURIComponent(secret)}`
}
