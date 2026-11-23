// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * START AT LOGIN: A SYSTEMD USER UNIT THAT STARTS THE OFFICE WHEN THE PERSON LOGS IN. Linux only. Wave 13u, round 3,
 * piece H9 (design report 6NVaDzG7tyUB, block b-4: a reboot ends every pty, tmux's too, so starting at login comes
 * before the beta). design/window/ACCEPTANCE.md, under W1, says what this means on Linux: a systemd unit, a user unit
 * with lingering or a system unit, set up by the installer or a first run, which says so.
 *
 * ON A MAC AND ON WINDOWS THE WINDOW SETS IT, AND THIS FILE ONLY SAYS WHERE. Both start Mole Office at login through
 * the window's own login item, the "Open at login" item of its menu (src/desktop/the-window-on-this-system.mjs). The
 * read below names that item and never says on or off, and the press refuses with the same words. On Windows an
 * office runs from the person's sign-in to their sign-out:
 * no administrator step, and nothing that keeps it running after sign-out. So the read says that signing out stops it.
 *
 * IN AN APPIMAGE THE PRESS ON WRITES NOTHING, AND THIS FILE SAYS THAT THE .deb INSTALL HAS IT. An AppImage runs from
 * the folder it is mounted at, which is new at each start and gone after it, so a unit written there would name a folder
 * that is not there at the next login. It was decided that the press On refuses in an AppImage and points to the .deb
 * install. So it refuses with its own code and writes and asks nothing, and the read never says on or off and does not
 * ask systemd. Whether the office runs from an AppImage is `theAppImageFolderHolding`
 * (./systems/the-installer-of-a-folder.mjs), asked of the folder the unit's command would run from.
 *
 * IN AN APPIMAGE THE PRESS OFF TAKES AWAY A UNIT A PRESS WROTE. A unit an older AppImage or another install wrote may
 * still be there, and a data folder move counts it. It was decided that the press Off removes such a unit and keeps a
 * copy of it. So, whatever systemd says of the unit, the press Off asks systemd to disable it, copies it to the first
 * backup name nothing has, removes its file, and asks systemd to read its units again, in that order. Disabling comes
 * first, so a refusal there has changed nothing, and each later refusal names the copy, or the name it failed at, and
 * says what was done before it. With no unit there it answers that start at login is already off, and asks systemd
 * nothing. The read names a unit a press wrote, and says that the press Off removes it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE PRESS WRITES, AND NOTHING ELSE
 * ---------------------------------------------------------------------------------------
 *
 * One systemd user unit, ~/.config/systemd/user/mole-office.service, which runs the `mole-office` command
 * (src/config/the-service-command.mjs) as `watch`: it starts the office, watches its server, starts it again when it
 * ends with no stop asked for, and stops the office when the unit is stopped. Then it asks systemd, as them, to read
 * the unit again and to enable it, so it starts at their next login. It never touches a system unit, never runs anything
 * as root, and never writes outside their home folder. Turning it off disables the unit and leaves the file, so the next
 * press turns it back on; in an AppImage it removes the file, as said above. A unit an older press wrote keeps working
 * as it did until this press writes it again.
 *
 * NEITHER PRESS STARTS OR STOPS THE OFFICE THAT IS RUNNING NOW. The press is answered by the office's own server, and
 * that server may be the one the unit started. `enable --now` would run `mole-office start`, which asks this same
 * server whether it answers while the server waits for systemctl to finish; `disable --now` would run
 * `mole-office stop`, which stops the server answering the press. So the presses only enable and disable.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A USER UNIT DOES AND DOES NOT DO
 * ---------------------------------------------------------------------------------------
 *
 * A user unit belongs to their own systemd, the user manager, which starts when they log in and, with lingering off, stops
 * when their last session ends. So the unit starts the office when they log in, not when the computer boots, and logging
 * out stops it, the terminal holder and its terminals with it (measured on 6 September 2026, problem dxeohQdtbTLi).
 * With lingering on (`loginctl enable-linger`), the user manager starts at boot and keeps running after they log out, and
 * so does the office. The read below says which holds.
 *
 * THE PRESS DOES NOT TURN LINGERING ON. Lingering is a setting of their login on the whole computer, not of the office.
 * On most systems a person may turn it on for their own user without root from a session they are logged in to, but this
 * server runs outside any session, where polkit asks for an administrator; on 6 September 2026 they used sudo. So the
 * panel says whether it is on and gives the command to run in their own terminal, as its own explained choice.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE UNIT IS Type=exec, KillMode=process, AND HAS NO ExecStop
 * ---------------------------------------------------------------------------------------
 *
 * `mole-office watch` runs `start` in its own process, then watches the server and starts it again when it ends with no
 * stop asked for. Read from systemd.service(5) and systemd.kill(5) (the manual pages are not installed in the sandbox
 * this was written in, so this is from systemd's documentation as published, not from a run):
 *
 *   · Type=exec: systemd counts the unit as started once the command has run, and needs systemd 240 or later for it.
 *     `watch` stays as the unit's main process, so the unit stays active while it watches. Type=simple would count the
 *     unit started before the command runs, so a command that cannot run would not fail the unit; Type=oneshot, the
 *     older shape, waited for `start` to exit and then left the unit with no watcher.
 *   · No RemainAfterExit: with Type=exec the unit is active while `watch` runs, so nothing has to keep it active after a
 *     command has exited. The old Type=oneshot needed RemainAfterExit=yes for that.
 *   · No ExecStop: systemd runs ExecStop whenever a started unit's main process ends, even when it crashed, so an
 *     ExecStop would let a crashed watcher stop the office. `watch` stops the office itself on SIGTERM instead, which
 *     is what systemd sends when the unit is stopped (a `systemctl --user stop`, their logout without lingering, a
 *     shutdown). It stops watching first, cancels a waiting try, waits for a running try, and then runs `stop`. A stop
 *     of the unit ends the holder too, and the holder's terminals end with it (src/config/the-service-command.mjs).
 *   · KillMode=process: when the unit ends, systemd kills only the unit's main process, which is `watch`, and the
 *     server and the terminal holder it started stay running. The default, control-group, kills every process left in
 *     the unit's control group, and the server and the holder are in it. After a stop, what is left is only what
 *     `stop` did not end: a holder it could not end, which it names (the readings did not agree, or the holder
 *     outlived the wait). systemd logs that such a process "remains running after unit stopped". KillMode=none
 *     would also do it and is deprecated.
 *   · Restart=on-failure, RestartSec=30: when `watch` itself fails, for example a first start that failed and answered
 *     its code, systemd tries again after 30 seconds, at most three times in ten minutes (StartLimitBurst,
 *     StartLimitIntervalSec), and then leaves the unit failed, which the read shows.
 *   · TimeoutStopSec: how long systemd waits for `watch` to end once it was asked to stop. The stop may wait for a try
 *     that is running when the stop comes, and then run the whole stop, so the timeout is the holder's start wait, the
 *     server's start wait, the stop's wait and the holder's stop wait, and fifteen seconds more.
 *
 * WHAT IT DOES NOT DO: systemd does not watch the server itself, so the unit's own restart rule still covers only a
 * failed start, or a `watch` that ended. A server that ends later with no stop asked for is started again by `watch`,
 * by the window's rule and at most three tries in ten minutes. A server ended by SIGKILL, or one that left no note, is
 * not started again: nothing says it ended on its own. The unit does not make the office come back for ever: once the
 * tries are used, the next start is the person's.
 *
 * A RESTART OF THE UNIT ENDS WHAT ITS STOP ENDS, AND IT IS LEFT SO (wave 13t, round W20). `systemctl --user restart`
 * sends the same SIGTERM that a stop sends, and then runs ExecStart again. `watch` is given nothing that tells a
 * restart from a stop, so it runs `stop` either way, and the restart ends the server and the holder with its terminals.
 * The unit does not try to tell the two apart. Reading systemd's job list would rest on systemd's internal state, and a
 * stop line that left the holder would leave it at every `systemctl --user stop` too. The restart that keeps the
 * terminals is the service command's own, `mole-office restart`, which the window's "Restart the service" runs: it
 * stops and starts the server, and leaves the holder running.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE UNIT NAMES, AND WHAT IT LEAVES OUT
 * ---------------------------------------------------------------------------------------
 *
 * The command as howToStart('command') gives it, from a checkout and from a bundle, except in a paired office: there it
 * is the development checkout's service command, because the stable checkout's own, started from a unit with nothing
 * but these three settings, would read the stable checkout's defaults and not the office's; the database and the port this
 * office serves, so the unit starts this office and not whatever a shell with nothing set would start; and the PATH
 * this office was started with, because a user unit gets systemd's short default PATH and the office's worker starts tsx
 * and the agent tools through PATH. That PATH is read from this server's environment by `theSearchPathIn` of the system
 * (./systems/the-system.mjs), the one reader of a search path in src/, and is the office's own from before its start
 * joined the user's entries after it (`theOfficesOwnSearchPathIn` in ./the-users-own-path.mjs). Everything else, the keys among it, the command
 * reads from .env and the office's own files as any start does. No key and nothing secret is written into the unit. When the office moves, or its
 * database or port changes, the read says the unit is out of date and the press writes it again.
 *
 * FROM A LINUX BUNDLE THE UNIT NAMES ELECTRON_RUN_AS_NODE=1 AS WELL, because the command there is the app's own program,
 * which opens the app unless it is told to run as Node (`theInstallsNode` in ./settings.mjs). A unit an older Linux
 * install wrote named the Node that install carried instead, which an upgrade takes away; `keepTheOlderUnit` below
 * writes such a unit again at a start, so the person needs no terminal.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, unlinkSync } from 'node:fs'
import { userInfo } from 'node:os'
import { dirname, join } from 'node:path'
import { THE_COMMAND_ENTRY, THE_INSTALL, howToStart, settings, theShippedNodeIn } from './settings.mjs'
import { thePairOfThisProcess } from './the-office-tool-environment.mjs'
import { theOfficesOwnSearchPathIn } from './the-users-own-path.mjs'
import { theAppImageFolderHolding } from './systems/the-installer-of-a-folder.mjs'
import { copyUnderAFreeName } from './a-backup-under-a-free-name.mjs'
import { TheFileBesideIsLeft, UnderAFile, firstLineOf, quoted, readOrNull, theSystemctl, writeTheUnit } from './the-mail-tool.mjs'
import { HOLDER_START_WAIT_MS, HOLDER_STOP_WAIT_MS, START_WAIT_MS, STOP_WAIT_MS } from './the-service-command.mjs'

/** The unit's name, as systemd knows it. */
export const START_AT_LOGIN_UNIT = 'mole-office.service'

/** The first line of every unit this press writes. The press is drawn on Settings and on Terminal management (wave 13t round W18c). */
export const START_AT_LOGIN_UNIT_MARK = '# Written by the press "Start at login" in Mole Office, on Settings or on Terminal management. A second press writes it again.'

/**
 * HOW A SECOND PRESS KNOWS THE FILE IS ITS OWN: its first line begins with these words. Until round W18c the first line
 * named only the Terminal management page. A unit with that older line is still the press's own, and it reads as out of
 * date, so the press writes it again with the line above.
 */
export const START_AT_LOGIN_UNIT_MARK_BEGINS = '# Written by the press "Start at login" '

/** The suffix of a unit's first copy, made before the press writes it again. A later copy adds -2, -3 and on. */
export const START_AT_LOGIN_BACKUP_SUFFIX = '.mole-office-backup'

/**
 * The code of each way the unit's write can be refused (round W26). The path is the copy's, except for the write, and
 * for the file the write made beside the unit when it is left alone (round W29). When the copy and that file are both
 * left, the path is the copy's and `beside` names the file.
 */
const START_AT_LOGIN_UNIT_REFUSED = /** @type {const} */ ({
  'the copy': 'startAtLoginNotBackedUp',
  'the write': 'startAtLoginNotWritten',
  'the write, and the copy is left': 'startAtLoginCopyLeft',
  'the write, and the file beside is left': 'startAtLoginUnitKeptFileLeft',
  'the write, and the copy and the file beside are left': 'startAtLoginCopyAndFileLeft',
})

/**
 * How long systemd lets `watch` stop the office: a try that is running when the stop comes, and then the stop itself.
 */
export const STOP_TIMEOUT_SECONDS = Math.ceil((HOLDER_START_WAIT_MS + START_WAIT_MS + STOP_WAIT_MS + HOLDER_STOP_WAIT_MS) / 1000) + 15

/** The command they run in their own terminal to turn lingering on. */
export const THE_LINGER_COMMAND = 'loginctl enable-linger'

/**
 * Where the unit is written, under their home folder.
 * @param {string} home
 */
export function theStartAtLoginUnitPath(home) {
  return join(home, '.config', 'systemd', 'user', START_AT_LOGIN_UNIT)
}

/**
 * @typedef {{ command: string, args: string[], databasePath: string, port: number, path: string, environment?: Record<string, string> }} TheOfficeToStart
 *   `environment` is what the command needs set besides these, as howToStart('command') gives it.
 */

/**
 * THE OFFICE THE UNIT WOULD START: this install's command, and the database, port and PATH this server runs with.
 * The PATH is the office's own, as this server was started with it, and never the user's entries its start joined after
 * it (./the-users-own-path.mjs): the office the unit starts reads the user's PATH again at its own start.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {TheOfficeToStart}
 */
export function theOfficeThisServerIs(env = process.env) {
  const how = howToStart('command')
  // A PAIRED OFFICE IS STARTED BY THE DEVELOPMENT CHECKOUT'S SERVICE COMMAND (wave 13q, item E). That command pairs the
  // stable office it starts, through the helper (src/config/the-office-tool-environment.mjs).
  const pair = THE_INSTALL.from === 'bundle' ? null : thePairOfThisProcess()
  const args = pair === null ? how.args : [join(pair.development, THE_COMMAND_ENTRY)]
  const s = settings(env)
  return { command: how.command, args, databasePath: s.databasePath, port: s.apiPort, path: String(theOfficesOwnSearchPathIn(env) ?? ''), environment: how.environment }
}

/**
 * The unit's command for one verb of the service command, each word quoted as systemd reads it.
 * @param {{ command: string, args: string[] }} office
 * @param {string} verb
 */
const theUnitsCommand = (office, verb) => [office.command, ...office.args, verb].map(quoted).join(' ')

/**
 * The unit's lines for what the command needs set besides the database, the port and PATH.
 * @param {Record<string, string> | undefined} environment
 */
const theUnitsEnvironment = (environment) => Object.entries(environment ?? {}).map(([name, value]) => `Environment=${quoted(`${name}=${value}`)}`)

/**
 * THE UNIT'S TEXT. The comment above this file's imports says why each line is there.
 * @param {TheOfficeToStart} office
 */
export function theStartAtLoginUnit(office) {
  return [
    START_AT_LOGIN_UNIT_MARK,
    '[Unit]',
    'Description=Mole Office: the office and its terminal holder, started at login and started again when it ends on its own (mole-office watch)',
    'StartLimitIntervalSec=600',
    'StartLimitBurst=3',
    '',
    '[Service]',
    'Type=exec',
    `ExecStart=${theUnitsCommand(office, 'watch')}`,
    'KillMode=process',
    'Restart=on-failure',
    'RestartSec=30',
    `TimeoutStopSec=${String(STOP_TIMEOUT_SECONDS)}`,
    `Environment=${quoted(`MOLE_OFFICE_DB=${office.databasePath}`)}`,
    `Environment=${quoted(`MOLE_OFFICE_PORT=${String(office.port)}`)}`,
    `Environment=${quoted(`PATH=${office.path}`)}`,
    ...theUnitsEnvironment(office.environment),
    '',
    '[Install]',
    'WantedBy=default.target',
    '',
  ].join('\n')
}

/**
 * @typedef {import('./the-mail-tool.mjs').Systemctl} Systemctl
 * @typedef {(args: string[]) => { code: number, out: string, err: string }} Loginctl
 * @typedef {'startAtLoginNotLinux' | 'startAtLoginNoSystemd' | 'startAtLoginNotOurs' | 'startAtLoginSystemdRefused' | 'startAtLoginNotBackedUp' | 'startAtLoginNotWritten' | 'startAtLoginCopyLeft' | 'startAtLoginUnitKeptFileLeft' | 'startAtLoginCopyAndFileLeft' | 'startAtLoginFileLeft' | 'startAtLoginUnderAFile' | 'startAtLoginInAnAppImage' | 'startAtLoginOffNotCopied' | 'startAtLoginOffNotRemoved' | 'startAtLoginOffNotReloaded'} StartAtLoginRefusal
 * @typedef {{ ok: false, code: StartAtLoginRefusal, says: string, path?: string, beside?: string }} Refused
 * @typedef {{ home: string, office: TheOfficeToStart, platform?: string, appImage?: string, systemctl?: Systemctl, writeWhole?: (path: string, text: string, mode: number) => void, remove?: (path: string) => void }} PressInput
 *   writeWhole is a test's stand-in for the unit's write (round W29); the press itself never gives one. appImage is
 *   the AppImage's own folder when the office runs from one; when it is not given, `theAppImageOf` below asks.
 */

/**
 * `loginctl`, as them: what it printed, and its exit code.
 * @type {Loginctl}
 */
export function theLoginctl(args) {
  try {
    const out = execFileSync('loginctl', args, { encoding: 'utf8', timeout: 10_000, stdio: ['ignore', 'pipe', 'pipe'] })
    return { code: 0, out, err: '' }
  } catch (err) {
    const failed = /** @type {{ status?: number | null, stdout?: string, stderr?: string, message?: string }} */ (err)
    return { code: typeof failed.status === 'number' ? failed.status : 1, out: String(failed.stdout ?? ''), err: String(failed.stderr ?? failed.message ?? '') }
  }
}

/**
 * WHAT SYSTEMD SAYS OF THE UNIT AT THEIR LOGIN: true for "enabled", false for "disabled", null for anything else or
 * nothing. "enabled-runtime" is enabled for this boot only, so it is not "starts at login", and it is null here.
 * @param {Systemctl} run
 * @returns {{ word: string | null, startsAtLogin: boolean | null }}
 */
function whatSystemdSaysAtLogin(run) {
  const said = run(['is-enabled', START_AT_LOGIN_UNIT]).out.trim()
  const word = said === '' ? null : said
  return { word, startsAtLogin: word === 'enabled' ? true : word === 'disabled' ? false : null }
}

/**
 * Whether the unit's file is there, and whether this press wrote it for the office as it is now.
 * @param {string | null} text
 * @param {string} wouldWrite
 * @returns {'none' | 'current' | 'out of date' | 'not ours'}
 */
function theUnitAsItIs(text, wouldWrite) {
  if (text === null) return 'none'
  if (!text.startsWith(START_AT_LOGIN_UNIT_MARK_BEGINS)) return 'not ours'
  return text === wouldWrite ? 'current' : 'out of date'
}

/**
 * @typedef {{
 *   systemd: 'answers' | 'no answer' | 'not linux' | 'not asked',
 *   setInTheMenuBar: boolean,
 *   setInTheTray: boolean,
 *   fromAnAppImage: boolean,
 *   unit: 'none' | 'current' | 'out of date' | 'not ours',
 *   unitPath: string,
 *   startsAtLogin: boolean | null,
 *   enabledWord: string | null,
 *   activeWord: string | null,
 *   linger: 'yes' | 'no' | null,
 *   user: string,
 *   lingerCommand: string,
 *   says: string,
 * }} StartAtLoginReading
 */

/**
 * WHETHER THE OFFICE STARTS AT THEIR LOGIN, AS SYSTEMD SAYS: the unit's file, whether systemd answers for their login,
 * whether the unit is enabled and active, and whether lingering is on. Each answer systemd does not give is null, never
 * a guess.
 * @param {PressInput & { loginctl?: Loginctl, user?: string }} input
 * @returns {StartAtLoginReading}
 */
export function readStartAtLogin(input) {
  const platform = input.platform ?? process.platform
  const unitPath = theStartAtLoginUnitPath(input.home)
  const user = input.user ?? userInfo().username
  const unit = theUnitAsItIs(readOrNull(unitPath), theStartAtLoginUnit(input.office))
  const appImage = platform === 'linux' ? theAppImageOf(input) : null
  const base = { unit, unitPath, user, lingerCommand: THE_LINGER_COMMAND, fromAnAppImage: appImage !== null }
  if (platform === 'darwin') {
    // ON A MAC THE SERVER SAYS WHERE, NEVER ON OR OFF (wave 13u's condition to 13t, message Ux__34vHQle1): the login
    // item belongs to the window, and this server cannot read it, so any on or off said here would be a guess.
    return { ...base, systemd: 'not linux', setInTheMenuBar: true, setInTheTray: false, startsAtLogin: null, enabledWord: null, activeWord: null, linger: null, says: `${THE_MAC_WAY}. This server cannot read either of them, so it does not say whether the office starts at login.` }
  }
  if (platform === 'win32') {
    // ON WINDOWS, AS ON A MAC, WHERE AND NEVER ON OR OFF (round W12): the login item belongs to the window, and this
    // server does not read it. For the beta, signing out stops the office.
    return {
      ...base,
      systemd: 'not linux',
      setInTheMenuBar: false,
      setInTheTray: true,
      startsAtLogin: null,
      enabledWord: null,
      activeWord: null,
      linger: null,
      says: `${THE_WINDOWS_WAY}. This server does not read that setting, so it does not say whether the office starts at sign-in. ${THE_WINDOWS_SIGN_OUT}`,
    }
  }
  if (platform !== 'linux') {
    return { ...base, systemd: 'not linux', setInTheMenuBar: false, setInTheTray: false, startsAtLogin: null, enabledWord: null, activeWord: null, linger: null, says: `${theSystemdWayIsLinuxOnly(platform)}.` }
  }
  if (appImage !== null) {
    // IN AN APPIMAGE THE SERVER SAYS WHERE IT CAN BE HAD, NEVER ON OR OFF, and asks systemd nothing. A unit there may
    // name a folder an AppImage was mounted at once, which is gone, so what systemd says of it is not whether the
    // office starts. The press Off removes a unit a press wrote, so the read names it.
    const left = unit === 'current' || unit === 'out of date' ? ` A unit a press wrote is at ${unitPath}, and turning start at login off removes it.` : ''
    return {
      ...base,
      systemd: 'not asked',
      setInTheMenuBar: false,
      setInTheTray: false,
      startsAtLogin: null,
      enabledWord: null,
      activeWord: null,
      linger: null,
      says: `${THE_APPIMAGE_WAY} systemd was not asked, so this does not say whether the office starts at login.${left}`,
    }
  }
  const run = input.systemctl ?? theSystemctl
  const systemd = run(['show-environment'])
  if (systemd.code !== 0) {
    return {
      ...base,
      systemd: 'no answer',
      setInTheMenuBar: false,
      setInTheTray: false,
      startsAtLogin: null,
      enabledWord: null,
      activeWord: null,
      linger: null,
      says: `systemd does not answer for your login on this computer (${firstLineOf(systemd)}), so the office cannot start at login here.`,
    }
  }
  const atLogin = unit === 'none' || unit === 'not ours' ? { word: null, startsAtLogin: unit === 'none' ? false : null } : whatSystemdSaysAtLogin(run)
  const active = unit === 'none' ? null : run(['is-active', START_AT_LOGIN_UNIT]).out.trim() || null
  const lingerSaid = (input.loginctl ?? theLoginctl)(['show-user', user, '--property=Linger', '--value'])
  const lingerWord = lingerSaid.code === 0 ? lingerSaid.out.trim() : ''
  const linger = lingerWord === 'yes' || lingerWord === 'no' ? lingerWord : null
  const says =
    unit === 'not ours'
      ? `${unitPath} is there and the press did not write it, so the press leaves it alone.`
      : atLogin.startsAtLogin === true
        ? `The office starts when you log in${unit === 'out of date' ? ', but its unit is not the one the press writes for this office now; press again to write it again' : ''}.`
        : atLogin.startsAtLogin === false
          ? 'The office does not start when you log in.'
          : `systemd says "${String(atLogin.word)}" of the unit, so whether the office starts at your login is not known.`
  return { ...base, systemd: 'answers', setInTheMenuBar: false, setInTheTray: false, startsAtLogin: atLogin.startsAtLogin, enabledWord: atLogin.word, activeWord: active, linger, says }
}

/** Where a Mac sets it: the one place, said the same way by the read and by the press's refusal. */
const THE_MAC_WAY = 'On a Mac, tick "Open at login" in the Mole Office menu in the menu bar, or add Mole Office in System Settings, under General, Login Items'

/**
 * Where Windows sets it, said the same way by the read and by the press's refusal. The window offers the item only when
 * it runs from an install (`offersOpenAtLogin`), so the sentence says so.
 */
const THE_WINDOWS_WAY =
  'On Windows, tick "Open at login" in the menu of the Mole Office icon, in the notification area at the right of the taskbar. ' +
  'An installed Mole Office has that item, and one run from its code does not'

/** What the read says for an office on Windows in the beta. */
const THE_WINDOWS_SIGN_OUT = 'Signing out of Windows stops the office, and nothing keeps it running until you sign in again.'

/** Why an AppImage has no start at login, and where it can be had, said the same way by the read and by the press's refusal. */
const THE_APPIMAGE_WAY =
  'Start at login is not available from the AppImage. A unit would name the folder the AppImage is mounted at, which is new at each start. ' +
  'The .deb install has it.'

/**
 * THE APPIMAGE'S OWN FOLDER WHEN THE OFFICE RUNS FROM ONE, or null: the input's when it gives one, or else
 * `theAppImageFolderHolding` asked of the folder the unit's command would run from.
 * @param {PressInput} input
 * @returns {string | null}
 */
const theAppImageOf = (input) => input.appImage ?? theAppImageFolderHolding(dirname(input.office.command))

/**
 * WHY THIS PRESS DOES NOTHING OFF LINUX, AND ON A MAC AND ON WINDOWS WHAT DOES IT INSTEAD. A Mac starts Mole Office at
 * login through the window's own login item, by decision fdIhVGe4R7fp: the "Open at login" item of the menu-bar
 * menu (src/desktop/the-window-on-this-system.mjs), which System Settings shows under General, Login Items. Only the
 * window can set it, so this server names it rather than setting it. Wave 13t, round 20, agreed with wave 13u through
 * the secretary (message 9aZCwfsVTCcX). Windows does the same from the menu of the icon in the notification area (round W12).
 * @param {string} platform
 */
function theSystemdWayIsLinuxOnly(platform) {
  if (platform === 'darwin') return `This press starts the office at login on Linux only. ${THE_MAC_WAY}`
  if (platform === 'win32') return `This press starts the office at login on Linux only. ${THE_WINDOWS_WAY}`
  return `Starting at login is built for Linux only, and this computer runs ${platform}`
}

/**
 * THE REFUSAL WHEN A FILE STANDS WHERE A FOLDER OF THE UNIT GOES (round W28), so the unit can be neither read nor
 * written. The read and both presses refuse with it, and the path is that file. Null for any other error.
 * @param {unknown} err what reading the unit threw
 * @returns {Refused | null}
 */
export function theUnitIsUnderAFile(err) {
  if (!(err instanceof UnderAFile)) return null
  return {
    ok: false,
    code: 'startAtLoginUnderAFile',
    path: err.file,
    says: `${err.file} is a file, not a folder, so the unit at ${err.path} cannot be read or written. Nothing was changed. Move that file aside, and try again.`,
  }
}

/**
 * The refusals both presses share: not Linux, a file where a folder of the unit goes, and a unit of that name the press
 * did not write. The press On is refused in an AppImage as well (see the header), and the answer says whether the office
 * runs from one.
 * @param {PressInput} input
 * @param {'on' | 'off'} press
 * @returns {Refused | { ok: true, before: string | null, unitPath: string, inAnAppImage: boolean }}
 */
function mayThePressTouchTheUnit(input, press) {
  const platform = input.platform ?? process.platform
  if (platform !== 'linux') {
    return { ok: false, code: 'startAtLoginNotLinux', says: `${theSystemdWayIsLinuxOnly(platform)}. Nothing was written.` }
  }
  const inAnAppImage = theAppImageOf(input) !== null
  if (inAnAppImage && press === 'on') {
    return { ok: false, code: 'startAtLoginInAnAppImage', says: `${THE_APPIMAGE_WAY} Nothing was changed, and systemd was not asked.` }
  }
  const unitPath = theStartAtLoginUnitPath(input.home)
  let before
  try {
    before = readOrNull(unitPath)
  } catch (err) {
    const underAFile = theUnitIsUnderAFile(err)
    if (underAFile === null) throw err
    return underAFile
  }
  if (before !== null && !before.startsWith(START_AT_LOGIN_UNIT_MARK_BEGINS)) {
    return {
      ok: false,
      code: 'startAtLoginNotOurs',
      path: unitPath,
      says: `${unitPath} is already there and the press did not write it, so it was left as it is and nothing was changed. Move it aside, and press again.`,
    }
  }
  return { ok: true, before, unitPath, inAnAppImage }
}

/**
 * TURN START AT LOGIN ON: the unit written, or written again when the office it names is not this one as it is now,
 * the old one copied beside it first, under the first backup name nothing has (round W26); systemd asked to read it
 * again; and the unit enabled, so it starts at their next login. The office running now is left as it is. Everything
 * that can refuse is asked before anything is written, but the copy and the write, which refuse with their own codes.
 * @param {PressInput} input
 * @returns {Refused | { ok: true, wrote: string[], turned: 'on' | 'already on', says: string }}
 */
export function turnStartAtLoginOn(input) {
  const may = mayThePressTouchTheUnit(input, 'on')
  if (!may.ok) return may
  const run = input.systemctl ?? theSystemctl
  const systemd = run(['show-environment'])
  if (systemd.code !== 0) {
    return {
      ok: false,
      code: 'startAtLoginNoSystemd',
      says: `systemd does not answer for your login on this computer (${firstLineOf(systemd)}), so the office cannot start at login here. Nothing was written.`,
    }
  }
  const text = theStartAtLoginUnit(input.office)
  /** @type {string[]} */
  const wrote = []
  if (may.before !== text) {
    let unit
    try {
      mkdirSync(dirname(may.unitPath), { recursive: true })
      unit = writeTheUnit(may.unitPath, text, may.before, `${may.unitPath}${START_AT_LOGIN_BACKUP_SUFFIX}`, input.writeWhole)
    } catch (err) {
      // ONLY A FIRST UNIT THROWS, when its folder cannot be made or it cannot be written (round W27); a unit that was
      // there is copied, and its write refuses. So the press refuses as when a unit was there, never with a 500. When
      // the file the write made beside the unit could not be removed, the refusal names that file (round W28).
      if (may.before !== null) throw err
      const says = `${may.unitPath} could not be written, so there is still no unit there: ${String(err)}.`
      if (err instanceof TheFileBesideIsLeft) return { ok: false, code: 'startAtLoginFileLeft', path: err.beside, says }
      return { ok: false, code: 'startAtLoginNotWritten', path: may.unitPath, says }
    }
    if (!unit.ok) return { ok: false, code: START_AT_LOGIN_UNIT_REFUSED[unit.refused], path: unit.path, ...('beside' in unit ? { beside: unit.beside } : {}), says: unit.says }
    wrote.push(...unit.wrote, `the unit, into ${may.unitPath}`)
    const reloaded = run(['daemon-reload'])
    if (reloaded.code !== 0) {
      return { ok: false, code: 'startAtLoginSystemdRefused', says: `${wrote.join('; ')} were written, and then systemd would not read the unit again (${firstLineOf(reloaded)}). Press again.` }
    }
  }
  if (whatSystemdSaysAtLogin(run).startsAtLogin === true) {
    return {
      ok: true,
      wrote,
      turned: 'already on',
      says: wrote.length === 0 ? 'The office already starts when you log in, so nothing was written.' : `Written: ${wrote.join('; ')}. The office already started when you log in, and still does.`,
    }
  }
  const enabled = run(['enable', START_AT_LOGIN_UNIT])
  if (enabled.code !== 0) {
    return {
      ok: false,
      code: 'startAtLoginSystemdRefused',
      says: `${wrote.length === 0 ? 'Nothing was written' : `${wrote.join('; ')} were written`}, and then systemd would not enable the unit (${firstLineOf(enabled)}).`,
    }
  }
  return {
    ok: true,
    wrote,
    turned: 'on',
    says: `${wrote.length === 0 ? 'Nothing was written' : `Written: ${wrote.join('; ')}`}. The office starts at your next login. The office running now was left as it is.`,
  }
}

/**
 * TURN START AT LOGIN OFF: the unit disabled, so it does not start at their next login. The unit's file stays, so the
 * next press turns it back on, and the office running now is left running. In an AppImage a unit a press wrote is
 * taken away instead (see the header).
 * @param {PressInput} input
 * @returns {Refused | { ok: true, turned: 'off' | 'already off', says: string }}
 */
export function turnStartAtLoginOff(input) {
  const may = mayThePressTouchTheUnit(input, 'off')
  if (!may.ok) return may
  if (may.before === null) return { ok: true, turned: 'already off', says: 'The office does not start when you log in: there is no unit. Nothing was changed.' }
  const run = input.systemctl ?? theSystemctl
  if (may.inAnAppImage) return takeTheUnitAwayInAnAppImage(may.unitPath, run, input.remove ?? unlinkSync)
  if (whatSystemdSaysAtLogin(run).startsAtLogin === false) {
    return { ok: true, turned: 'already off', says: 'The office already did not start when you log in. Nothing was changed.' }
  }
  const disabled = run(['disable', START_AT_LOGIN_UNIT])
  if (disabled.code !== 0) {
    return { ok: false, code: 'startAtLoginSystemdRefused', says: `systemd would not disable the unit (${firstLineOf(disabled)}). Nothing was changed.` }
  }
  return { ok: true, turned: 'off', says: 'The office no longer starts when you log in. The office running now keeps running, and the unit stays, so the press turns it back on.' }
}

/**
 * THE PRESS OFF IN AN APPIMAGE, for a unit a press wrote (see the header): disabled, copied, removed, and systemd asked
 * to read its units again, whatever systemd said of it before. A step that fails refuses, and says what was done before
 * it. The office running now keeps running.
 * @param {string} unitPath
 * @param {Systemctl} run
 * @param {(path: string) => void} remove unlinkSync, or a test's stand-in for a removal that fails after the copy, which
 *   no folder can be made to give, because the copy and the unit are in one folder
 * @returns {Refused | { ok: true, turned: 'off', says: string }}
 */
function takeTheUnitAwayInAnAppImage(unitPath, run, remove) {
  const disabled = run(['disable', START_AT_LOGIN_UNIT])
  if (disabled.code !== 0) {
    return { ok: false, code: 'startAtLoginSystemdRefused', says: `systemd would not disable the unit (${firstLineOf(disabled)}). Nothing was changed.` }
  }
  const copied = copyUnderAFreeName(unitPath, `${unitPath}${START_AT_LOGIN_BACKUP_SUFFIX}`)
  if ('failed' in copied) {
    return {
      ok: false,
      code: 'startAtLoginOffNotCopied',
      path: copied.path,
      says: `systemd disabled the unit, and then it could not be copied to ${copied.path} (${String(copied.failed)}), so its file at ${unitPath} was not removed.`,
    }
  }
  try {
    remove(unitPath)
  } catch (err) {
    return {
      ok: false,
      code: 'startAtLoginOffNotRemoved',
      path: copied.path,
      says: `systemd disabled the unit and it was copied to ${copied.path}, and then its file at ${unitPath} could not be removed (${String(err)}).`,
    }
  }
  const reloaded = run(['daemon-reload'])
  if (reloaded.code !== 0) {
    return {
      ok: false,
      code: 'startAtLoginOffNotReloaded',
      path: copied.path,
      says: `systemd disabled the unit, it was copied to ${copied.path}, and ${unitPath} was removed. Then systemd would not read its units again (${firstLineOf(reloaded)}).`,
    }
  }
  return {
    ok: true,
    turned: 'off',
    says: `systemd disabled the unit and ${unitPath} was removed, so the office does not start when you log in. A copy of it is at ${copied.path}. The office running now keeps running.`,
  }
}

/**
 * STOP THE LOGIN UNIT, for a data folder move that has to switch the `.env` line. The unit's `watch` runs the
 * service command's stop, so stopping the unit stops the office and its terminal holder.
 * @param {Systemctl} [run]
 * @returns {{ ok: boolean, says: string }}
 */
export function stopTheStartAtLoginUnit(run = theSystemctl) {
  const said = run(['stop', START_AT_LOGIN_UNIT])
  return said.code === 0
    ? { ok: true, says: 'The Mole Office login unit was stopped.' }
    : { ok: false, says: `systemd would not stop the Mole Office login unit (${firstLineOf(said)}), so the data folder was not moved and nothing was changed.` }
}

/**
 * START THE LOGIN UNIT again, for a data folder move. The unit names the database it was written for, in its own
 * environment, so an office it starts opens that database whatever the `.env` line says: after a switch that is the old
 * folder's database, and the move then switches back (DF11). A move is refused while the unit would start the office
 * (DF4), so this start runs only for a unit that began to run after the move's check. So the sentence names no folder.
 * @param {Systemctl} [run]
 * @returns {{ ok: boolean, says: string }}
 */
export function startTheStartAtLoginUnit(run = theSystemctl) {
  const said = run(['start', START_AT_LOGIN_UNIT])
  return said.code === 0
    ? { ok: true, says: 'The Mole Office login unit was started.' }
    : { ok: false, says: `systemd would not start the Mole Office login unit (${firstLineOf(said)}), so the office did not start.` }
}

/**
 * AT EVERY START OF A LINUX OFFICE AN INSTALLER MADE, A UNIT AN OLDER VERSION WROTE IS WRITTEN AGAIN (see the header).
 * It is written again only when it is the press's own, its ExecStart line is exactly the one a press wrote for this
 * command with the Node the office carried then, at `theShippedNodeIn` in its folder, and that Node is no longer there.
 * Only that line changes, and the lines for what the command needs set go after the unit's last Environment line, where
 * the press puts them. Every other line is left as it was, so a unit that named another database or port still names
 * it. The unit is copied first, as the press copies it, and systemd is asked to read it again. It is neither enabled
 * nor disabled. Nothing is read where the command needs nothing set, which is a checkout, Windows and the Mac.
 * src/server/index.ts calls this in its start and prints the line. When no such unit was found the answer is null.
 * @param {PressInput & { checkout: string }} input `checkout` is the office's own folder
 * @returns {{ written: boolean, line: string } | null}
 */
export function keepTheOlderUnit(input) {
  const needs = theUnitsEnvironment(input.office.environment)
  if ((input.platform ?? process.platform) !== 'linux' || needs.length === 0) return null
  const older = join(input.checkout, ...theShippedNodeIn('linux'))
  if (existsSync(older)) return null
  const unitPath = theStartAtLoginUnitPath(input.home)
  let before
  try {
    before = readOrNull(unitPath)
  } catch (err) {
    // A FILE WHERE A FOLDER OF THE UNIT GOES: there is no unit there to write again.
    if (theUnitIsUnderAFile(err) === null) throw err
    return null
  }
  if (before === null || !before.startsWith(START_AT_LOGIN_UNIT_MARK_BEGINS)) return null
  const lines = before.split('\n')
  const at = lines.indexOf(`ExecStart=${theUnitsCommand({ command: older, args: input.office.args }, 'watch')}`)
  if (at === -1) return null
  lines[at] = `ExecStart=${theUnitsCommand(input.office, 'watch')}`
  lines.splice(Math.max(at, ...lines.map((line, index) => (line.startsWith('Environment=') ? index : -1))) + 1, 0, ...needs)
  const gone = `The unit ${unitPath} ran the office with ${older}, the Node an older version of this office carried, which is gone`
  const unit = writeTheUnit(unitPath, lines.join('\n'), before, `${unitPath}${START_AT_LOGIN_BACKUP_SUFFIX}`, input.writeWhole)
  if (!unit.ok) return { written: false, line: `${gone}, and it could not be written again: ${unit.says}` }
  const written = `${gone}, so it was written again to run it with ${input.office.command}, run as Node. Written: ${[...unit.wrote, `the unit, into ${unitPath}`].join('; ')}.`
  const reloaded = (input.systemctl ?? theSystemctl)(['daemon-reload'])
  if (reloaded.code !== 0) return { written: false, line: `${written} Then systemd would not read the unit again (${firstLineOf(reloaded)}), so it runs the older line until it does.` }
  return { written: true, line: `${written} systemd read it again. Whether the office starts at login was left as it was.` }
}
