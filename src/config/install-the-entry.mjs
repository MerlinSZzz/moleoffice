// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE ENTRY FOLLOWS THE PERSON: ONE SKILL LINK AND THREE HOOK LINES, WRITTEN ONCE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS
 * ---------------------------------------------------------------------------------------
 *
 * A new agent opened in another project's folder on 14 September 2026 could not find Mole Office at all,
 * because the entry was wired to one directory: the skill link and the two hook lines lived one
 * directory above the checkout and served sessions started there and nowhere else. Put at user
 * level, both travel with the person to every directory a session is started in.
 *
 * The install writes exactly two things:
 *
 *   1. `~/.claude/skills/mole-office` — a SYMLINK to `<checkout>/.claude/skills/mole-office`, and
 *      on Windows a DIRECTORY JUNCTION, which any user may make there: a symbolic link to a folder
 *      needs an administrator or Developer Mode on Windows, and a junction needs neither. A link,
 *      never a copy: a copy is a second skill that drifts from the one in the checkout, and
 *      chapter 9 rule 6 of the office regulations says so.
 *
 *      AN APPIMAGE'S OFFICE LINKS TO A COPY IT KEEPS CURRENT (round W19). An AppImage runs its office
 *      in a folder that is the AppImage's, and a later start can run in another one. With FUSE, each
 *      start mounts it at a new folder. With APPIMAGE_EXTRACT_AND_RUN, it is unpacked to a temporary
 *      folder named after the file's MD5, so a new version is unpacked to another one (round W20's
 *      label ran both). A link into that folder would not follow the office. The link stays a link, to
 *      a copy of the skill that the office keeps in its own data folder and writes again from its own
 *      skill at every start and at every press. The .deb and the Windows package keep linking to the
 *      installed skill.
 *   2. `~/.claude/settings.json` — ONE entry appended to each of `hooks.SessionStart`, `hooks.Stop` and
 *      `hooks.SessionEnd`, each running the office's session hook with a timeout. These are
 *      the three hooks the owner's machine has (read on 28 September 2026), and the same block
 *      `tools/session-hook.mjs` holds for wiring by hand, so the press puts back all of it.
 *
 *      IN A CHECKOUT EACH LINE RUNS `tools/session-hook.mjs` with the `node` on PATH. IN AN OFFICE AN
 *      INSTALLER MADE, EACH LINE RUNS THE HOOK THE OFFICE CARRIES, built into `for-agents/session-hook.mjs`,
 *      with the install's own Node (`theInstallsNode` in ./settings.mjs), both by whole paths. A person who installed the
 *      office may have no Node of their own.
 *
 *      ON LINUX THAT NODE IS THE APP'S OWN PROGRAM, which opens the app unless it is told to run as Node. So each line
 *      sets ELECTRON_RUN_AS_NODE=1 at its start, which `sh` reads as the line's own environment, and the AppImage's
 *      launcher below exports it before it runs the hook.
 *
 *      ON WINDOWS EACH LINE NAMES ITS PROGRAM AND ITS ARGUMENTS SEPARATELY, and Claude Code starts the program
 *      itself, with no shell (Claude Code's hooks reference, read on 18 November 2026). One string read by a shell,
 *      as Linux and the Mac still have, is not enough there: Claude Code gives it to Git Bash when Git for Windows is
 *      installed and to PowerShell when it is not, and PowerShell does not read a quoted program at the start of a
 *      line as a command. With `args` each path is one argument exactly as written, so a path with a space stays
 *      whole and the shell in use does not matter.
 *
 *      A WINDOWS LINE THE OFFICE WROTE BEFORE THIS CHANGE IS REPLACED BY A PRESS. It named the hook in one string,
 *      which PowerShell does not run without Git Bash, so a press that finds it exactly as this office wrote it puts
 *      the exec-form line in its place, in the same group and position. A line that only names the hook is left as
 *      it is, and a press adds no second line beside it.
 *
 *      A LINE AN OLDER LINUX INSTALL WROTE IS WRITTEN AGAIN AT A START. Those lines ran the hook with the Node the office
 *      carried then, at runtime/bin/node in its folder, which an upgrade takes away. `keepTheOlderHookLines` below
 *      writes each such line again with the app's own program, once that Node is gone, so the person needs no terminal.
 *
 *      AN APPIMAGE'S LINES RUN A LAUNCHER THE OFFICE KEEPS (round W23). Its hook and its Node are in the
 *      AppImage's folder too, so a line naming them would lead nowhere once a later start runs in another
 *      folder. So each line runs `session-hook/run` in the office's data folder with `/bin/sh`, and that
 *      path does not change. The launcher is a short file naming the hook and the Node in the folder the
 *      office runs in, and the office writes it again at every start and at every press, as it writes the
 *      skill's copy. It runs them only while that folder is a folder, owned by this user or by root, that
 *      nobody else can write in: after a stop the path is free, and another user can make a folder there.
 *      Otherwise it says one line at a session's start, says nothing at a stop or an end, and ends with 0.
 *
 * IT MERGES. The pixel-agents entry that was already there stays exactly as it was, and so does
 * every other hook array and every other key in the file. The merge reads the whole file, changes
 * the three arrays, and writes it back.
 *
 * IT IS SAFE AND IDEMPOTENT, and each guarantee is here rather than in a route or a tool:
 *
 *   · it backs the file up before it changes it, to `<settings>.mole-office-backup` the first time and to `-2`, `-3`
 *     and on after that. It makes a copy only where nothing is, so no press writes over the person's first backup or
 *     any later one, and a press that is refused after it made its copy takes the copy away (round W24);
 *   · a press that has no hook line to add leaves the settings file and its backups as they were;
 *   · it refuses to write anything if the file does not parse, if the backup cannot be made, or if
 *     anything under `~/.claude/skills/mole-office` is not a link it may replace;
 *   · it points a hook only at a folder git keeps as a checkout, or one an installer keeps as an
 *     installed office, and only when that folder holds the skill and the hook the three lines name.
 *     A linked worktree and an unpacked copy are both refused, in words, and nothing is written
 *     (problem `hlNgNPM9hGTh`);
 *   · in an office an installer made, which has no `.git`, it also refuses in words when the Node the
 *     three lines would run is not there. Which installer made the folder is asked of the installer,
 *     never read from the folder's name or its path;
 *   · it writes through a temporary file in the same directory and renames it, so a reader never
 *     sees half a file;
 *   · pressed twice, the second press writes nothing and says so.
 *
 * IT LEAVES THE SERVER'S THREAD FREE. The press runs on the server's thread, so every file call it makes is a promise
 * of `node:fs/promises`, and so is its question to an installer. The server answers other requests while the press
 * works. The two writes an AppImage's office makes at its start share the press's writers, so they go the same way.
 * The other runtimes' entry, at the end of this file, reads and writes the same way, and so does the writer of a
 * runtime's rules file that it asks. One call on its way still holds the thread: `settings()` reads this checkout's
 * .env file each time it is asked, and the block that entry writes asks it for the office's address.
 * Two presses in one process run one after the other, the other runtimes' press among them, as they did while each
 * held the thread: a second press that started between the first's calls would find the first's link half made and
 * be refused.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS A `.mjs` MODULE AND NOT A `.ts` ONE
 * ---------------------------------------------------------------------------------------
 *
 * Two callers install the entry. `POST /api/office/install-the-entry` is the person's press on the
 * Settings page, and `tools/install-the-entry.mjs` is the same act from a terminal on a machine
 * with no browser. The terminal tool runs under bare `node`, which cannot read TypeScript, so the
 * ONE implementation lives here and both call it. A second copy of the merge is the defect this
 * whole piece is about.
 *
 * ---------------------------------------------------------------------------------------
 * THE HOME DIRECTORY IS READ FROM THIS PROCESS AND NEVER FROM A REQUEST
 * ---------------------------------------------------------------------------------------
 *
 * `theOwnersHome()` below is the only place the home directory is worked out, and it reads it from
 * the environment of the process that is running: the server's own environment for the press, and
 * the person's shell for the terminal tool. It is NEVER taken from a request body, a query or a
 * header. A door that took a path from its caller would be a door that writes anywhere on their disk,
 * and the whole point of this act is that it writes into exactly one directory.
 */

import { randomBytes } from 'node:crypto'
import { access, cp, lstat, mkdir, readFile, readlink, rename, rm, symlink, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

// THE ADDRESS IS ASKED FOR, NEVER TYPED HERE: one module declares every setting
// (`tests/one-configuration-source.test.ts`), and one module writes a runtime's rules file
// (`tests/one-set-of-rules.test.ts`).
import {
  settings,
  THE_BUILD_STAMP_FILE,
  THE_FOR_AGENTS_FOLDER,
  THE_SESSION_HOOK,
  RUN_AS_NODE,
  thePerUserDataFolder,
  theInstallsNode,
  theInstallsNodeInALine,
  theShippedNodeIn,
} from './settings.mjs'
import { theGlobalRulesTargets, writeGlobalRulesFile } from '../worker/rules.ts'
import { copyUnderAFreeNameWithoutHoldingTheThread, takeTheCopyAwayWithoutHoldingTheThread } from './a-backup-under-a-free-name.mjs'
import { theAppImageFolderHolding } from './systems/the-installer-of-a-folder.mjs'
import { thisSystem } from './systems/the-system.mjs'

/**
 * @typedef {import('./systems/the-installer-of-a-folder.mjs').AnInstallerMade} AnInstallerMade
 */

/** The timeout, in seconds, on each hook line. The hook's own header names the same number. */
export const ENTRY_HOOK_TIMEOUT_SECONDS = 10

/** The name the skill link takes under `~/.claude/skills`. */
export const ENTRY_SKILL_NAME = 'mole-office'

/** The suffix the backup of `settings.json` carries, beside the file it copies. */
export const ENTRY_BACKUP_SUFFIX = '.mole-office-backup'

/**
 * WHERE THE HOME DIRECTORY IS, READ FROM THIS PROCESS.
 *
 * See the header: this is the one place, and it is never a value from a request. `homedir()` is
 * `$HOME` on this machine, and the tests point `HOME` at a scratch directory so nothing here ever
 * touches the owner's own `~/.claude`.
 *
 * @returns {string}
 */
export function theOwnersHome() {
  const home = homedir()
  if (typeof home !== 'string' || home === '') {
    throw new Error(
      'This process has no home directory, so there is nowhere to put the Mole Office entry. ' +
        'Nothing was written.',
    )
  }
  return home
}

/** The skill in an office's own folder.
 * @param {string} checkout
 */
const theSkillIn = (checkout) => join(checkout, '.claude', 'skills', ENTRY_SKILL_NAME)

/**
 * Every path the install reads or writes, worked out once.
 *
 * @param {string} home
 * @param {string} checkout
 */
export function theEntryPaths(home, checkout) {
  const claude = join(home, '.claude')
  const skills = join(claude, 'skills')
  return {
    home,
    checkout,
    claude,
    settingsPath: join(claude, 'settings.json'),
    backupPath: join(claude, `settings.json${ENTRY_BACKUP_SUFFIX}`),
    skillsDirectory: skills,
    skillLink: join(skills, ENTRY_SKILL_NAME),
    skillSource: theSkillIn(checkout),
  }
}

/**
 * WHAT THE THREE HOOK LINES RUN, and the words for the office that holds it. In a checkout, its own
 * `tools/session-hook.mjs` with the `node` on PATH. In an office an installer made, the hook built into its for-agents
 * folder with the install's own Node and the environment it needs, each by its whole path (see the header).
 *
 * @param {string} checkout
 * @param {boolean} installed whether an installer made the office
 * @param {string | undefined} platform the system the office runs on, which says where it keeps its Node
 * @returns {{ hook: string, node: string | null, environment: Record<string, string>, theNode: string, office: string }}
 *   `theNode` is the Node in a person's words.
 */
function whatTheLinesRun(checkout, installed, platform) {
  if (!installed) return { hook: join(checkout, 'tools', 'session-hook.mjs'), node: null, environment: {}, theNode: 'the `node` on PATH', office: 'this checkout' }
  if (platform === undefined) {
    throw new Error(
      `The system this press was given does not say which system it is, so the press cannot tell where the installed office ${checkout} keeps its Node.`,
    )
  }
  const node = theInstallsNode({ from: 'bundle', platform, root: checkout, named: true })
  return {
    hook: join(checkout, THE_FOR_AGENTS_FOLDER, THE_SESSION_HOOK),
    node: node.program,
    environment: node.environment,
    theNode: RUN_AS_NODE in node.environment ? "this app's own program, run as Node" : 'the Node this office carries',
    office: 'this installed office',
  }
}

/**
 * The command one hook line runs, in the form the settings file carries it, for a shell to read.
 *
 * The path is quoted rather than bare because a checkout under a directory with a space in its name
 * would otherwise be two arguments. It is `node "<hook>" start` and `node "<hook>" end`, which is
 * the spelling the hook's own header block gives. In an installed office the install's own Node takes the place of
 * `node`, by its whole path and quoted the same way, after the variables it needs (`theInstallsNodeInALine`).
 *
 * This is the form Linux and the Mac carry. On Windows `theEntryGroup` names the program and its arguments
 * separately instead, because no one string runs in both Git Bash and PowerShell.
 *
 * @param {string} hookPath
 * @param {'start' | 'stop' | 'end'} mode
 * @param {string | null} [node] the Node to run the hook with, or null for the `node` on PATH
 * @param {Record<string, string>} [environment] what that Node needs set
 */
export function theEntryCommand(hookPath, mode, node = null, environment = {}) {
  return `${node === null ? 'node' : theInstallsNodeInALine({ program: node, environment })} ${JSON.stringify(hookPath)} ${mode}`
}

/**
 * The one hook line a group holds, in the shape Claude Code reads.
 *
 * ON WINDOWS THE PROGRAM AND ITS ARGUMENTS ARE NAMED SEPARATELY, which Claude Code starts with no shell. Each of
 * the hook's path and the mode is then one argument exactly as written, so a path with a space stays whole. A Node
 * that needs a variable set cannot be started that way, and has the shell line instead; no Windows install needs
 * one today.
 *
 * @param {string} hookPath
 * @param {'start' | 'stop' | 'end'} mode
 * @param {string | null} [node] the Node to run the hook with, or null for the `node` on PATH
 * @param {Record<string, string>} [environment] what that Node needs set
 * @param {string} [platform] the system the line is written for, this process's own unless a test names another
 */
export function theEntryLine(hookPath, mode, node = null, environment = {}, platform = process.platform) {
  if (platform === 'win32' && Object.keys(environment).length === 0) {
    return { type: 'command', command: node === null ? 'node' : node, args: [hookPath, mode], timeout: ENTRY_HOOK_TIMEOUT_SECONDS }
  }
  return { type: 'command', command: theEntryCommand(hookPath, mode, node, environment), timeout: ENTRY_HOOK_TIMEOUT_SECONDS }
}

/**
 * The one group a hook array gains, in the shape Claude Code reads.
 *
 * @param {string} hookPath
 * @param {'start' | 'stop' | 'end'} mode
 * @param {string | null} [node] the Node to run the hook with, or null for the `node` on PATH
 * @param {Record<string, string>} [environment] what that Node needs set
 * @param {string} [platform] the system the line is written for, this process's own unless a test names another
 */
export function theEntryGroup(hookPath, mode, node = null, environment = {}, platform = process.platform) {
  return {
    matcher: '',
    hooks: [theEntryLine(hookPath, mode, node, environment, platform)],
  }
}

/**
 * Whether a hook array already carries a line running this checkout's hook.
 *
 * MATCHED ON THE HOOK PATH ALONE, not on the whole command. A line that runs this hook without a
 * mode word is the same hook doing the same thing (the hook defaults to `start`), and adding a
 * second line beside it would file every session twice. A line running a DIFFERENT checkout's hook
 * does not match, so a session that moved checkout gains the new one and keeps the old.
 * On Windows the command carries the path as JSON spells it, with each backslash doubled, so both
 * spellings are looked for. A Windows line written before `args` was used carries one string, and
 * one written now carries the path among its arguments; both are the same line, so both are looked
 * at, and an older line is not joined by a second one.
 *
 * @param {unknown} array
 * @param {string} hookPath
 */
export function arrayAlreadyRuns(array, hookPath) {
  if (!Array.isArray(array)) return false
  return array.some((group) => {
    if (typeof group !== 'object' || group === null) return false
    const hooks = /** @type {{ hooks?: unknown }} */ (group).hooks
    if (!Array.isArray(hooks)) return false
    return hooks.some((hook) => {
      if (typeof hook !== 'object' || hook === null) return false
      const line = /** @type {{ command?: unknown, args?: unknown }} */ (hook)
      if (typeof line.command === 'string' && namesThePath(line.command, hookPath)) return true
      return Array.isArray(line.args) && line.args.some((one) => typeof one === 'string' && namesThePath(one, hookPath))
    })
  })
}

/**
 * Whether a piece of a hook line names `hookPath`, in either the plain spelling or the one JSON writes into the file.
 * @param {string} text
 * @param {string} hookPath
 */
function namesThePath(text, hookPath) {
  return text.includes(hookPath) || text.includes(JSON.stringify(hookPath))
}

/**
 * THE COMMANDS THE OFFICE WROTE FOR A HOOK BEFORE WINDOWS LINES NAMED THEIR PROGRAM AND THEIR ARGUMENTS.
 *
 * Each is one string with no `args`, the hook's path quoted, and the same Node a press writes now. The path may
 * be spelled as JSON spells it, with each backslash doubled, or plainly, so both spellings are returned.
 *
 * @param {string} hookPath
 * @param {'start' | 'stop' | 'end'} mode
 * @param {string | null} node
 * @param {Record<string, string>} environment
 * @returns {Set<string>}
 */
function theOlderWindowsLineCommands(hookPath, mode, node, environment) {
  const program = node === null ? 'node' : theInstallsNodeInALine({ program: node, environment })
  return new Set([
    `${program} ${JSON.stringify(hookPath)} ${mode}`,
    `${program} "${hookPath}" ${mode}`,
  ])
}

/**
 * THE ARRAY WITH EACH OLDER WINDOWS LINE REPLACED WHERE IT SITS.
 *
 * Only a line whose command is exactly one the office wrote, and which carries no `args`, is replaced. The group
 * keeps its other keys, every other line stays as it is, and the new line takes the older line's position.
 *
 * @param {unknown} array
 * @param {Set<string>} older
 * @param {unknown} line the exec-form line a press writes now
 * @returns {{ array: unknown[], replaced: number }}
 */
function withTheOlderWindowsLinesReplaced(array, older, line) {
  if (!Array.isArray(array)) return { array: [], replaced: 0 }
  let replaced = 0
  const groups = array.map((group) => {
    if (typeof group !== 'object' || group === null) return group
    const hooks = /** @type {{ hooks?: unknown }} */ (group).hooks
    if (!Array.isArray(hooks)) return group
    let inThisGroup = 0
    const lines = hooks.map((hook) => {
      if (typeof hook !== 'object' || hook === null) return hook
      const held = /** @type {{ command?: unknown, args?: unknown }} */ (hook)
      if (held.args !== undefined || typeof held.command !== 'string' || !older.has(held.command)) return hook
      inThisGroup += 1
      return line
    })
    if (inThisGroup === 0) return group
    replaced += inThisGroup
    return { ...group, hooks: lines }
  })
  return { array: groups, replaced }
}

/**
 * WHAT ONE PRESS DID, in a shape a route, a tool or a test can read.
 *
 * @typedef {object} EntryInstalled
 * @property {true} ok
 * @property {boolean} changed            Whether anything was written at all.
 * @property {string} settingsPath
 * @property {string | null} backupPath   Where the previous file was copied, or null because there was none.
 * @property {string} skillLink
 * @property {string} skillSource        What the skill link points at: the office's own skill, or an AppImage's copy of it.
 * @property {boolean} addedSessionStart
 * @property {boolean} addedStop
 * @property {boolean} addedSessionEnd
 * @property {boolean} createdSkillLink
 * @property {boolean} replacedSkillLink
 * @property {string} says                What happened, in a person's words.
 *
 * @typedef {object} EntryRefused
 * @property {false} ok
 * @property {true} refused
 * @property {string} path                The file the refusal is about.
 * @property {string} says                Which file, and why, in a person's words.
 */

/**
 * ONLY A CHECKOUT GIT ITSELF KEEPS MAY HAVE A HOOK POINTED AT IT.
 *
 * Found after problem fOfbpC0SKC-f: every worktree that ran the local-only registry test pressed
 * the entry door for real, and the press wrote the running worktree's path into the owner's own
 * `~/.claude`. The world guard in `src/server/api/entry.ts` asks WHICH OFFICE is answering; it did
 * not fire because a test app and a worker's worktree are not worlds. This asks the same question
 * about the checkout itself.
 *
 * WHY A WORKTREE IS THE SAME FAULT A WORLD IS. A worker's or a tester's worktree under
 * `~/.cache/mole-office/worktrees` is deleted when the work is done, exactly as a world's copy is
 * torn down. A skill link into either one is a link to a directory that no longer exists, and every
 * session on this machine afterwards starts with no skill and no way to tell that it has none
 * (chapter 9 rule 6). An ordinary checkout's `.git` is a directory; a linked worktree's `.git` is a
 * file naming the main checkout's `worktrees/<name>` directory. That difference is the whole check.
 *
 * A FOLDER WITH NO `.git` AT ALL IS REFUSED TOO, AND THAT IS PROBLEM `hlNgNPM9hGTh`. On 23 and 24
 * September 2026 measurement agents unpacked HEAD with `git archive` into throwaway folders and ran
 * this checkout's tools inside them. An unpacked copy carries no `.git`, so the worktree check above
 * said nothing, and the owner's own `~/.claude/settings.json` gained three more pairs of hook lines,
 * each running a `tools/session-hook.mjs` in a folder that was about to be deleted. A copy is the
 * same fault a worktree is, for the same reason: nobody keeps it.
 *
 * WHAT "A CHECKOUT THIS OFFICE KEEPS" MEANS HERE, and why it is not a list held somewhere. There is
 * no register of checkouts in the office to look a folder up in, and this act has to work on a
 * machine where no server is running at all — that is the whole reason the terminal tool exists. So
 * the question is asked of the folder itself, and git answers it: a `.git` DIRECTORY means git made
 * this folder and keeps it, a `.git` FILE means a linked worktree, and no `.git` means a copy.
 *
 * AN INSTALLED OFFICE HAS NO `.git` EITHER, BUT ITS INSTALLER KEEPS IT (round W16). It carries a build
 * stamp beside its code, and so does a copy of it, so the folder cannot say which it is. Its installer
 * can: dpkg's file list names the stamp of the office the .deb installed, and an entry in this user's
 * Installed apps on Windows holds the folder (`anInstallerMade` in ./systems/the-system.mjs). A folder
 * the installer does not hold is a copy, and is refused in a copy's words. A folder inside an AppImage's
 * own folder is kept by the AppImage, which can run a later start in another folder, so its skill link
 * leads to the copy the office keeps (round W19) and its hook lines run the launcher it keeps (round W23;
 * see the header). Round W16 refused it. An installer that cannot be asked is refused in words that say
 * what could not be asked, and the folder is read neither as installed nor as a copy.
 *
 * THE ONE PLACE BOTH CALLERS ASK IT. `POST /api/office/install-the-entry` and
 * `tools/install-the-entry.mjs` both call `installTheEntry`, so the check lives here and the
 * sentences are written once. It is tried before any other refusal, because what kind of folder this
 * is does not depend on the settings file or the skill link being in any particular state.
 *
 * @param {string} checkout
 * @param {{ anInstallerMade?: AnInstallerMade }} system
 * @returns {Promise<{ keptBy: 'git' } | { keptBy: 'its-installer', which: string, whenItIsRemoved: string | null }
 *   | { keptBy: 'an-appimage', folder: string } | EntryRefused>}  Who keeps the folder, or the refusal.
 */
async function whatKeepsTheFolder(checkout, system) {
  let git
  try {
    git = await lstat(join(checkout, '.git'))
  } catch {
    return aFolderWithNoGit(checkout, system)
  }
  if (!git.isFile()) return { keptBy: 'git' }
  return {
    ok: false,
    refused: true,
    path: checkout,
    says:
      `This checkout is a linked git worktree: ${checkout}. A worktree is deleted when the work is done, so ` +
      'the skill link it made would point at a directory that no longer exists, and every session on this ' +
      "machine would start with no skill. Nothing was written. Press it on the office's own checkout, the one " +
      'that stays.',
  }
}

/**
 * A FOLDER WITH NO `.git`: a copy, unless it has a build stamp and its installer holds it.
 * @param {string} checkout
 * @param {{ anInstallerMade?: AnInstallerMade }} system
 * @returns {Promise<{ keptBy: 'its-installer', which: string, whenItIsRemoved: string | null } | { keptBy: 'an-appimage', folder: string }
 *   | EntryRefused>}  `whenItIsRemoved` says what becomes of the skill link and the hook lines when the installer removes the office, and is
 *   null where nothing is said yet. `folder` is the AppImage's own folder, which the office runs in.
 */
async function aFolderWithNoGit(checkout, system) {
  /** @param {string} says @returns {EntryRefused} */
  const refused = (says) => ({ ok: false, refused: true, path: checkout, says })
  const copy = refused(
    `This folder is not a checkout git keeps: ${checkout}. There is no .git in it, so it is a copy somebody ` +
      'made — with git archive, with tar, or with cp — and a copy is thrown away when the work that made it is ' +
      'done. The hook line would then run a file that is no longer there, at the start of every session on this ' +
      "machine. Nothing was written. Run this in the office's own checkout, the one git made and keeps.",
  )
  const stamp = join(checkout, THE_BUILD_STAMP_FILE)
  if (!(await somethingIsAt(stamp))) return copy
  if (system.anInstallerMade === undefined) {
    throw new Error(`The system this press was given cannot be asked which installer made ${checkout}, so the press cannot tell an installed office from a copy.`)
  }
  const made = await system.anInstallerMade(checkout, stamp)
  switch (made.made) {
    case 'by-dpkg':
      return {
        keptBy: 'its-installer',
        which: `the one the package ${made.package} installed`,
        whenItIsRemoved:
          `If the package ${made.package} is removed, this link and the three hook lines stay. The package is removed for ` +
          "the whole computer, and its removal changes nothing in anyone's home folder, where they are. The link then leads " +
          'nowhere, and each hook line runs a program that is no longer there, so it fails at the start of every session, ' +
          'at the end of every turn and at the end of every session. Delete the link and the three lines then, or install ' +
          'the package again and they work again.',
      }
    case 'by-windows':
      return { keptBy: 'its-installer', which: `in the folder which Windows lists in Installed apps as ${made.entry}`, whenItIsRemoved: null }
    case 'by-none':
      return copy
    case 'in-an-appimage':
      return { keptBy: 'an-appimage', folder: made.folder }
    case 'unknown':
      return refused(
        `Mole Office could not ask ${made.couldNotAsk} whether it installed this folder: ${checkout} (${made.because}). ` +
          'The folder has a build stamp and no .git, so it is an installed office or a copy of one, and only its ' +
          'installer can say which. Nothing was written.',
      )
  }
}

/**
 * The press before this one in this process, which the next waits for. It never rejects. The Claude Code entry's press
 * and the other runtimes' press both wait here, so no two presses in one process run at the same moment.
 *
 * @type {Promise<void>}
 */
let thePressBefore = Promise.resolve()

/**
 * Run `press` once the press before it in this process has ended, and make the next press wait for this one.
 *
 * @template T
 * @param {() => Promise<T>} press
 * @returns {Promise<T>}
 */
async function afterThePressBefore(press) {
  const before = thePressBefore
  /** @type {() => void} */
  let done = () => {}
  thePressBefore = new Promise((resolve) => {
    done = () => resolve()
  })
  try {
    await before
    return await press()
  } finally {
    done()
  }
}

/**
 * INSTALL THE ENTRY. The one implementation the press and the terminal tool both call.
 *
 * It never throws for a state a caller can act on: a file that does not parse, a backup that cannot
 * be made, or something at the skill's path that is not a link all come back as `{ ok: false }`
 * with a sentence naming the file and the reason. A thrown error would be an accident, not an
 * answer.
 *
 * @param {{ home: string, checkout: string, system?: { platform?: string, aFolderIsLinkedBy: 'a-symbolic-link' | 'a-junction', anInstallerMade?: AnInstallerMade } }} input
 *   `system` is this computer's system unless a test names another. An installed office's press needs its `platform`,
 *   which says where the office keeps its Node.
 * @returns {Promise<EntryInstalled | EntryRefused>}
 */
export async function installTheEntry(input) {
  return afterThePressBefore(() => pressTheEntry(input))
}

/**
 * One press, alone. `installTheEntry` above runs one at a time.
 *
 * @param {Parameters<typeof installTheEntry>[0]} input
 * @returns {Promise<EntryInstalled | EntryRefused>}
 */
async function pressTheEntry(input) {
  const paths = theEntryPaths(input.home, input.checkout)
  const system = input.system ?? thisSystem()
  const linkedBy = system.aFolderIsLinkedBy

  // A FOLDER NOBODY KEEPS IS REFUSED BEFORE ANYTHING IS READ OR WRITTEN: a linked worktree, or a
  // copy with no `.git` at all. See the reasoning above.
  const kept = await whatKeepsTheFolder(paths.checkout, system)
  if ('ok' in kept) return kept

  // THE SOURCE OF THE LINK HAS TO EXIST, or a press would leave a link pointing at nothing and
  // report success. This is the checkout's own skill, so its absence is a broken checkout rather
  // than anything the person did.
  if (!(await somethingIsAt(paths.skillSource))) {
    return {
      ok: false,
      refused: true,
      path: paths.skillSource,
      says:
        `The skill this entry links to is not in this checkout: ${paths.skillSource}. ` +
        'Nothing was written.',
    }
  }

  // A CHECKOUT'S LINES RUN ITS OWN HOOK, AND AN INSTALLED OFFICE'S RUN THE HOOK AND THE NODE IT CARRIES.
  const installed = kept.keptBy === 'its-installer' ? kept : null
  const appImage = kept.keptBy === 'an-appimage' ? kept.folder : null
  const runs = whatTheLinesRun(paths.checkout, kept.keptBy !== 'git', system.platform)

  // AND SO DOES THE HOOK THE THREE LINES WOULD RUN. Without this, a checkout missing `tools/` still
  // got its hook lines written, and every session on this machine then started by running a file
  // that was not there. The hook is the office's own, so its absence is a broken office.
  if (!(await somethingIsAt(runs.hook))) {
    return {
      ok: false,
      refused: true,
      path: runs.hook,
      says: `The hook these three lines would run is not in ${runs.office}: ${runs.hook}. Nothing was written.`,
    }
  }
  // AND THE NODE AN INSTALLED OFFICE'S LINES WOULD RUN IT WITH, for the same reason.
  if (runs.node !== null && !(await somethingIsAt(runs.node))) {
    return {
      ok: false,
      refused: true,
      path: runs.node,
      says: `The Node these three lines would run the hook with is not in ${runs.office}: ${runs.node}. Nothing was written.`,
    }
  }

  // AN APPIMAGE'S LINES RUN THE LAUNCHER IN ITS DATA FOLDER, which runs that hook with that Node, and its skill link
  // leads to the copy of its skill there (see the header).
  const lines = appImage === null ? runs : { hook: theAppImagesHookLauncher(), node: THE_LAUNCHERS_SHELL, environment: {} }
  const linkedTo = appImage === null ? paths.skillSource : theAppImagesSkillCopy()

  // ---- the settings file, parsed whole or refused whole.
  const settingsExisted = await somethingIsAt(paths.settingsPath)
  let settings = {}
  if (settingsExisted) {
    let text
    try {
      text = await readFile(paths.settingsPath, 'utf8')
    } catch (err) {
      return {
        ok: false,
        refused: true,
        path: paths.settingsPath,
        says: `The settings file could not be read, so nothing was written: ${paths.settingsPath} (${String(err)}).`,
      }
    }
    try {
      const parsed = JSON.parse(text)
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return {
          ok: false,
          refused: true,
          path: paths.settingsPath,
          says:
            `The settings file is not a JSON object, so nothing was written: ${paths.settingsPath}. ` +
            'Merge into it by hand, or fix it, and press again.',
        }
      }
      settings = parsed
    } catch (err) {
      return {
        ok: false,
        refused: true,
        path: paths.settingsPath,
        says:
          `The settings file does not parse, so nothing was written: ${paths.settingsPath} (${String(err)}). ` +
          'Fix it, or move it aside, and press again.',
      }
    }
  }

  const hooksHeld = settings['hooks']
  if (hooksHeld !== undefined && (typeof hooksHeld !== 'object' || hooksHeld === null || Array.isArray(hooksHeld))) {
    return {
      ok: false,
      refused: true,
      path: paths.settingsPath,
      says:
        `The settings file's "hooks" is not an object, so nothing was written: ${paths.settingsPath}. ` +
        'Fix it by hand and press again.',
    }
  }
  const hooks = /** @type {Record<string, unknown>} */ (hooksHeld ?? {})
  for (const name of ['SessionStart', 'Stop', 'SessionEnd']) {
    const held = hooks[name]
    if (held !== undefined && !Array.isArray(held)) {
      return {
        ok: false,
        refused: true,
        path: paths.settingsPath,
        says:
          `The settings file's "hooks.${name}" is not a list, so nothing was written: ${paths.settingsPath}. ` +
          'Fix it by hand and press again.',
      }
    }
  }

  const sessionStart = /** @type {unknown[]} */ (hooks['SessionStart'] ?? [])
  const stop = /** @type {unknown[]} */ (hooks['Stop'] ?? [])
  const sessionEnd = /** @type {unknown[]} */ (hooks['SessionEnd'] ?? [])
  const addedSessionStart = !arrayAlreadyRuns(sessionStart, lines.hook)
  const addedStop = !arrayAlreadyRuns(stop, lines.hook)
  const addedSessionEnd = !arrayAlreadyRuns(sessionEnd, lines.hook)

  // A WINDOWS PRESS PUTS A LINE THE OFFICE WROTE BEFORE THIS CHANGE INTO THE FORM IT WRITES NOW, in its place.
  const replacedSessionStart =
    system.platform === 'win32'
      ? withTheOlderWindowsLinesReplaced(
          sessionStart,
          theOlderWindowsLineCommands(lines.hook, 'start', lines.node, lines.environment),
          theEntryLine(lines.hook, 'start', lines.node, lines.environment, system.platform),
        )
      : { array: sessionStart, replaced: 0 }
  const replacedStop =
    system.platform === 'win32'
      ? withTheOlderWindowsLinesReplaced(
          stop,
          theOlderWindowsLineCommands(lines.hook, 'stop', lines.node, lines.environment),
          theEntryLine(lines.hook, 'stop', lines.node, lines.environment, system.platform),
        )
      : { array: stop, replaced: 0 }
  const replacedSessionEnd =
    system.platform === 'win32'
      ? withTheOlderWindowsLinesReplaced(
          sessionEnd,
          theOlderWindowsLineCommands(lines.hook, 'end', lines.node, lines.environment),
          theEntryLine(lines.hook, 'end', lines.node, lines.environment, system.platform),
        )
      : { array: sessionEnd, replaced: 0 }
  const replacedAny = replacedSessionStart.replaced > 0 || replacedStop.replaced > 0 || replacedSessionEnd.replaced > 0

  // ---- the skill link, which must be a link or nothing at all.
  const need = await whatTheSkillLinkNeeds(paths, linkedTo)
  if ('ok' in need) return need
  const { createdSkillLink, replacedSkillLink, previousTarget } = need

  // AN APPIMAGE'S PRESS ALWAYS WRITES: the copy and the launcher are written again at every press.
  const changed =
    appImage !== null || addedSessionStart || addedStop || addedSessionEnd || replacedAny || createdSkillLink || replacedSkillLink
  if (!changed) {
    return {
      ok: true,
      changed: false,
      settingsPath: paths.settingsPath,
      backupPath: null,
      skillLink: paths.skillLink,
      skillSource: paths.skillSource,
      addedSessionStart: false,
      addedStop: false,
      addedSessionEnd: false,
      createdSkillLink: false,
      replacedSkillLink: false,
      says:
        `The Mole Office entry is already in place: the skill link points at ${runs.office} and all three hook ` +
        'lines are in the settings file. Nothing was written.',
    }
  }

  // ---- an AppImage's copy and launcher, written again before anything leads to them.
  if (appImage !== null) {
    const notKept = await writeTheAppImagesFiles(paths, appImage, runs)
    if (notKept !== null) return notKept
  }

  // ---- the two writes: the link first, then the settings file through a rename.
  const notLinked = await writeTheSkillLink(paths, need, linkedBy, linkedTo)
  if (notLinked !== null) return notLinked

  // A PRESS WITH NO LINE TO ADD LEAVES THE SETTINGS FILE AND ITS BACKUPS AS THEY WERE. Its lines already run what they
  // should: an AppImage's the launcher this press wrote again, and any other office's its hook.
  const added = { addedSessionStart, addedStop, addedSessionEnd }
  const replaced = {
    replacedSessionStart: replacedSessionStart.replaced > 0,
    replacedStop: replacedStop.replaced > 0,
    replacedSessionEnd: replacedSessionEnd.replaced > 0,
  }
  if (!addedSessionStart && !addedStop && !addedSessionEnd && !replacedAny) {
    if (appImage !== null) return theAppImagesEntry(paths, { folder: appImage, runs, need, added, backupPath: null })
    return theLinkWrittenAlone(paths, { installed, runs, need })
  }

  /** @type {string | null} */
  let backupPath = null
  if (settingsExisted) {
    const copied = await copyUnderAFreeNameWithoutHoldingTheThread(paths.settingsPath, paths.backupPath)
    if ('failed' in copied) {
      // NOTHING WAS WRITTEN, and the link that was just made is put back the way it was, so a
      // refused press leaves the directory exactly as it found it.
      await putTheLinkBack(paths, previousTarget, createdSkillLink || replacedSkillLink, linkedBy)
      return {
        ok: false,
        refused: true,
        path: copied.path,
        says:
          `The settings file could not be backed up, so nothing was written to it: ${copied.path} (${String(copied.failed)}). ` +
          'Fix what is in the way and press again.',
      }
    }
    backupPath = copied.path
  }

  if (addedSessionStart) hooks['SessionStart'] = [...sessionStart, theEntryGroup(lines.hook, 'start', lines.node, lines.environment, system.platform)]
  else if (replacedSessionStart.replaced > 0) hooks['SessionStart'] = replacedSessionStart.array
  if (addedStop) hooks['Stop'] = [...stop, theEntryGroup(lines.hook, 'stop', lines.node, lines.environment, system.platform)]
  else if (replacedStop.replaced > 0) hooks['Stop'] = replacedStop.array
  if (addedSessionEnd) hooks['SessionEnd'] = [...sessionEnd, theEntryGroup(lines.hook, 'end', lines.node, lines.environment, system.platform)]
  else if (replacedSessionEnd.replaced > 0) hooks['SessionEnd'] = replacedSessionEnd.array
  settings['hooks'] = hooks

  const temporary = `${paths.settingsPath}.mole-office-${String(process.pid)}`
  try {
    await writeFile(temporary, `${JSON.stringify(settings, null, 2)}\n`, 'utf8')
    await rename(temporary, paths.settingsPath)
  } catch (err) {
    try {
      await rm(temporary, { force: true })
    } catch {
      // The temporary file was already gone, which is the outcome that was wanted.
    }
    // A REFUSED PRESS LEAVES NO COPY OF ITS OWN. The copy was made where nothing was, so it is this press's to remove.
    const copyLeft = backupPath === null ? '' : await takeTheCopyAwayWithoutHoldingTheThread(backupPath)
    await putTheLinkBack(paths, previousTarget, createdSkillLink || replacedSkillLink, linkedBy)
    return {
      ok: false,
      refused: true,
      path: paths.settingsPath,
      says:
        `The settings file could not be written, so nothing was changed in it: ${paths.settingsPath} (${String(err)}).` +
        copyLeft,
    }
  }

  if (appImage !== null) return theAppImagesEntry(paths, { folder: appImage, runs, need, added, backupPath })
  const wrote = [
    ...theLinesInWords(added),
    createdSkillLink ? `the skill link ${paths.skillLink}` : null,
    replacedSkillLink ? `the skill link ${paths.skillLink}, which pointed somewhere else` : null,
  ].filter((one) => one !== null)

  return {
    ok: true,
    changed: true,
    settingsPath: paths.settingsPath,
    backupPath,
    skillLink: paths.skillLink,
    skillSource: paths.skillSource,
    addedSessionStart,
    addedStop,
    addedSessionEnd,
    createdSkillLink,
    replacedSkillLink,
    says:
      `Wrote ${wrote.join(', ')} into ${paths.settingsPath}, linking it to ${paths.skillSource}. ` +
      (installed === null
        ? ''
        : `This office is ${installed.which}. Each hook line runs the session hook this office carries, ${runs.hook}, ` +
          `with ${runs.theNode}, ${String(runs.node)}. `) +
      whatTheOlderLinesWere(replaced) +
      `${whereTheOldFileIs(backupPath, paths.backupPath)} Every other line in that file was left as it was.` +
      (installed === null || installed.whenItIsRemoved === null ? '' : ` ${installed.whenItIsRemoved}`),
  }
}

/**
 * What a checkout's or an installed office's press says when it wrote the skill link and had no hook line to add, so
 * the settings file and its backups were left as they were.
 * @param {ReturnType<typeof theEntryPaths>} paths
 * @param {{ installed: { which: string, whenItIsRemoved: string | null } | null, runs: { hook: string },
 *   need: { createdSkillLink: boolean, replacedSkillLink: boolean } }} done
 * @returns {EntryInstalled}
 */
function theLinkWrittenAlone(paths, done) {
  const { createdSkillLink, replacedSkillLink } = done.need
  return {
    ok: true,
    changed: true,
    settingsPath: paths.settingsPath,
    backupPath: null,
    skillLink: paths.skillLink,
    skillSource: paths.skillSource,
    addedSessionStart: false,
    addedStop: false,
    addedSessionEnd: false,
    createdSkillLink,
    replacedSkillLink,
    says:
      `Wrote the skill link ${paths.skillLink}${replacedSkillLink ? ', which pointed somewhere else' : ''}, linking it ` +
      `to ${paths.skillSource}. ` +
      (done.installed === null ? '' : `This office is ${done.installed.which}. `) +
      `The three hook lines in ${paths.settingsPath} already run ${done.runs.hook}, so that file was not changed.` +
      (done.installed === null || done.installed.whenItIsRemoved === null ? '' : ` ${done.installed.whenItIsRemoved}`),
  }
}

/**
 * The hook lines a press added, in a person's words.
 * @param {{ addedSessionStart: boolean, addedStop: boolean, addedSessionEnd: boolean }} added
 * @returns {string[]}
 */
function theLinesInWords(added) {
  return [
    added.addedSessionStart ? 'one hook line at SessionStart' : null,
    added.addedStop ? 'one hook line at Stop' : null,
    added.addedSessionEnd ? 'one hook line at SessionEnd' : null,
  ].filter((one) => one !== null)
}

/**
 * The older Windows hook lines a press replaced, in a person's words, with why they were replaced. Empty when it
 * replaced none.
 * @param {{ replacedSessionStart: boolean, replacedStop: boolean, replacedSessionEnd: boolean }} replaced
 * @returns {string}
 */
function whatTheOlderLinesWere(replaced) {
  const events = [
    replaced.replacedSessionStart ? 'SessionStart' : null,
    replaced.replacedStop ? 'Stop' : null,
    replaced.replacedSessionEnd ? 'SessionEnd' : null,
  ].filter((one) => one !== null)
  if (events.length === 0) return ''
  const named = events.length === 1 ? events[0] : `${events.slice(0, -1).join(', ')} and ${events.at(-1)}`
  const line = events.length === 1 ? 'line' : 'lines'
  const was = events.length === 1 ? 'was' : 'were'
  const one = events.length === 1 ? 'a line' : 'lines'
  const names = events.length === 1 ? 'names' : 'name'
  return (
    ` The older Windows hook ${line} at ${named} ${was} replaced with ${one} that ${names} the program and its ` +
    'arguments, because PowerShell does not run a line that starts with a quoted program.'
  )
}

/**
 * Where the file a press replaced is kept, in a person's words, and where the first backup is when this press's copy is
 * a later one. The settings press and the AGENTS.md press both say it.
 * @param {string | null} backupPath the copy this press made
 * @param {string} firstBackupPath where the first backup goes
 */
function whereTheOldFileIs(backupPath, firstBackupPath) {
  if (backupPath === null) return 'There was no settings file, so there was nothing to back up.'
  const here = `The file it replaced is backed up at ${backupPath}.`
  return backupPath === firstBackupPath ? here : `${here} The first backup, at ${firstBackupPath}, was not changed.`
}

/**
 * WHAT THE SKILL LINK NEEDS: to be made, to replace a link that points somewhere else, or nothing. Anything at its
 * path that is not a link is refused.
 * @param {ReturnType<typeof theEntryPaths>} paths
 * @param {string} [target] what the link is to point at: the office's own skill, or an AppImage's copy of it
 * @returns {Promise<{ createdSkillLink: boolean, replacedSkillLink: boolean, previousTarget: string | null } | EntryRefused>}
 */
async function whatTheSkillLinkNeeds(paths, target = paths.skillSource) {
  if (!(await somethingIsAt(paths.skillLink)) && !(await lstatExists(paths.skillLink))) return { createdSkillLink: true, replacedSkillLink: false, previousTarget: null }
  if (!(await lstat(paths.skillLink)).isSymbolicLink()) {
    return {
      ok: false,
      refused: true,
      path: paths.skillLink,
      says:
        `There is already something at ${paths.skillLink} and it is not a link, so nothing was written. ` +
        'A copy is a second skill that drifts from the one in the checkout. Move it aside and press again.',
    }
  }
  const previous = await readLink(paths.skillLink)
  if (previous === target) return { createdSkillLink: false, replacedSkillLink: false, previousTarget: null }
  return { createdSkillLink: false, replacedSkillLink: true, previousTarget: previous }
}

/**
 * The skill link written as `need` says: the skills directory made, a link that pointed somewhere else taken away,
 * and the link made. A refusal, or null when it is written or nothing was needed.
 * @param {ReturnType<typeof theEntryPaths>} paths
 * @param {{ createdSkillLink: boolean, replacedSkillLink: boolean }} need
 * @param {'a-symbolic-link' | 'a-junction'} linkedBy
 * @param {string} [target] what the link points at: the office's own skill, or an AppImage's copy of it
 * @returns {Promise<EntryRefused | null>}
 */
async function writeTheSkillLink(paths, need, linkedBy, target = paths.skillSource) {
  try {
    await mkdir(paths.skillsDirectory, { recursive: true })
  } catch (err) {
    return {
      ok: false,
      refused: true,
      path: paths.skillsDirectory,
      says: `The skills directory could not be made, so nothing was written: ${paths.skillsDirectory} (${String(err)}).`,
    }
  }
  try {
    if (need.replacedSkillLink) await unlink(paths.skillLink)
    if (need.createdSkillLink || need.replacedSkillLink) await linkTheFolder(target, paths.skillLink, linkedBy)
  } catch (err) {
    return {
      ok: false,
      refused: true,
      path: paths.skillLink,
      says: `The skill link could not be made, so nothing was written: ${paths.skillLink} (${String(err)}).`,
    }
  }
  return null
}

/**
 * WHERE AN APPIMAGE'S OFFICE KEEPS THE COPY OF ITS SKILL: in its own data folder, which settings.mjs works out in one
 * place. It is read when it is asked, as the office's data folder is read from this process's environment.
 * @returns {string}
 */
export function theAppImagesSkillCopy() {
  return join(thePerUserDataFolder(), 'skills', ENTRY_SKILL_NAME)
}

/**
 * THE COPY WRITTEN AGAIN, WHOLE, from the skill in the office's own folder: copied beside the old one, which is then
 * removed, and moved into its place. So a file the skill no longer has does not stay in the copy.
 * @param {string} source the skill in the office's folder
 * @param {string} copy
 * @returns {Promise<string | null>} why it could not be written, or null when it was
 */
async function writeTheSkillCopy(source, copy) {
  const fresh = `${copy}.being-written-${String(process.pid)}`
  try {
    await rm(fresh, { recursive: true, force: true })
    await mkdir(dirname(copy), { recursive: true })
    await cp(source, fresh, { recursive: true })
    await rm(copy, { recursive: true, force: true })
    await rename(fresh, copy)
    return null
  } catch (err) {
    return String(err)
  }
}

/**
 * AT EVERY START OF AN OFFICE IN AN APPIMAGE, THE COPY OF ITS SKILL IS WRITTEN AGAIN from the skill in the AppImage's
 * own folder (see the header). Only the copy: the skill link is made by the person's press. Outside an AppImage nothing
 * is written and the answer is null. src/server/index.ts calls this in its start and prints the line.
 * @param {string} checkout the office's own folder
 * @returns {Promise<{ written: boolean, line: string } | null>}
 */
export async function keepTheAppImagesSkillCopy(checkout) {
  const folder = theAppImageFolderHolding(checkout)
  if (folder === null) return null
  const source = theSkillIn(checkout)
  const copy = theAppImagesSkillCopy()
  const failed = await writeTheSkillCopy(source, copy)
  if (failed === null) {
    return {
      written: true,
      line:
        `This office runs from an AppImage, in the folder ${folder}, so it wrote the copy of its skill again, ` +
        `from ${source}: ${copy}.`,
    }
  }
  return {
    written: false,
    line:
      `This office runs from an AppImage, in the folder ${folder}, and the copy of its skill could not be written ` +
      `again, from ${source}: ${copy} (${failed}). A skill link to that copy leads to an older copy, or to nothing, ` +
      'until a start or a press of the entry writes it.',
  }
}

/**
 * WHERE AN APPIMAGE'S OFFICE KEEPS ITS HOOK LAUNCHER: in its own data folder, beside the copy of its skill, at a path
 * that does not change when the AppImage's folder does. The three hook lines run it (see the header).
 * @returns {string}
 */
export function theAppImagesHookLauncher() {
  return join(thePerUserDataFolder(), 'session-hook', 'run')
}

/** The shell the three hook lines run the launcher with, by its whole path. */
export const THE_LAUNCHERS_SHELL = '/bin/sh'

/** What the launcher says at a session's start when it does not run the hook. */
export const THE_LAUNCHERS_LINE_WHEN_IT_RUNS_NOTHING =
  "MOLE OFFICE — the folder Mole Office's AppImage last ran from is gone or is not safe to run from, so this session is not on the record. Nothing else changes."

/**
 * A value as sh reads it whole: in single quotes, each single quote in it ended, escaped and begun again.
 * @param {string} value
 */
const inSingleQuotes = (value) => `'${value.replaceAll("'", "'\\''")}'`

/**
 * THE LAUNCHER'S TEXT. It runs the hook with the Node, both by the whole paths the office ran them from, and passes on
 * the mode word and Claude Code's payload. It runs them only while the AppImage's folder is still one only this user
 * or root can have made and written in, because after a stop another user can make a folder at that path. Otherwise
 * it says one line at a start, nothing at a stop or an end, and ends with 0, as the hook itself always ends.
 * @param {string} folder the AppImage's own folder, which the office runs in
 * @param {{ hook: string, node: string | null, environment?: Record<string, string> }} runs the hook and the Node in that
 *   folder, and what that Node needs set
 * @returns {string}
 */
export function theHookLaunchersText(folder, runs) {
  const environment = Object.entries(runs.environment ?? {})
  return [
    '#!/bin/sh',
    "# Mole Office's session hook, run by the three hook lines Mole Office wrote in ~/.claude/settings.json.",
    '# Mole Office writes it again at every start and at every press of its entry, naming the hook and the Node',
    '# in the folder it runs from.',
    `folder=${inSingleQuotes(folder)}`,
    `node=${inSingleQuotes(String(runs.node))}`,
    `hook=${inSingleQuotes(runs.hook)}`,
    ...(environment.length === 0 ? [] : ["# The Node is the app's own program, which opens the app unless this tells it to run as Node."]),
    ...environment.map(([name, value]) => `export ${name}=${inSingleQuotes(value)}`),
    '# The hook is run from that folder only while nobody else can have made it or written in it: a folder, not a link,',
    '# owned by this user or by root, and not writable by anyone else. After a stop, another user can make a folder there.',
    'ours() {',
    '  [ -d "$1" ] && [ ! -L "$1" ] || return 1',
    "  set -- $(stat -c '%u %a' -- \"$1\" 2>/dev/null)",
    '  [ "$#" = 2 ] && { [ "$1" = "$(id -u)" ] || [ "$1" = 0 ]; } && [ $((0$2 & 022)) = 0 ]',
    '}',
    'if ours "$folder" && [ -x "$node" ] && [ -f "$hook" ]; then exec "$node" "$hook" "$@"; fi',
    `if [ "\${1:-start}" = start ]; then printf '%s\\n' ${inSingleQuotes(THE_LAUNCHERS_LINE_WHEN_IT_RUNS_NOTHING)}; fi`,
    'exit 0',
    '',
  ].join('\n')
}

/**
 * THE LAUNCHER WRITTEN AGAIN, WHOLE, through a new file beside it that is then renamed into its place, so a hook line
 * never runs half of it. Its folder is made readable by this user alone, and the new file is made under a name nobody
 * can have guessed, and only if nothing is there yet.
 * @param {string} folder
 * @param {{ hook: string, node: string | null, environment?: Record<string, string> }} runs
 * @param {string} launcher
 * @returns {Promise<string | null>} why it could not be written, or null when it was
 */
async function writeTheHookLauncher(folder, runs, launcher) {
  const fresh = `${launcher}.being-written-${randomBytes(8).toString('hex')}`
  try {
    await mkdir(dirname(dirname(launcher)), { recursive: true })
    await mkdir(dirname(launcher), { recursive: true, mode: 0o700 })
    await writeFile(fresh, theHookLaunchersText(folder, runs), { encoding: 'utf8', mode: 0o755, flag: 'wx' })
    await rename(fresh, launcher)
    return null
  } catch (err) {
    try {
      await rm(fresh, { force: true })
    } catch {
      // Nothing was there to remove.
    }
    return String(err)
  }
}

/**
 * AT EVERY START OF AN OFFICE IN AN APPIMAGE, ITS HOOK LAUNCHER IS WRITTEN AGAIN, naming the hook and the Node in the
 * AppImage's folder it runs in now (see the header). Only the launcher: the three hook lines are written by the
 * person's press. Outside an AppImage nothing is written and the answer is null. src/server/index.ts calls this in its
 * start and prints the line.
 * @param {string} checkout the office's own folder
 * @param {{ platform?: string }} [system] this computer's system unless a test names another
 * @returns {Promise<{ written: boolean, line: string } | null>}
 */
export async function keepTheAppImagesHookLauncher(checkout, system = thisSystem()) {
  const folder = theAppImageFolderHolding(checkout)
  if (folder === null) return null
  const runs = whatTheLinesRun(checkout, true, system.platform)
  const launcher = theAppImagesHookLauncher()
  const failed = await writeTheHookLauncher(folder, runs, launcher)
  if (failed === null) {
    return {
      written: true,
      line:
        `This office runs from an AppImage, in the folder ${folder}, so it wrote its hook launcher again, to run ` +
        `${runs.hook} with ${String(runs.node)}: ${launcher}.`,
    }
  }
  return {
    written: false,
    line:
      `This office runs from an AppImage, in the folder ${folder}, and its hook launcher could not be written again: ` +
      `${launcher} (${failed}). Hook lines that run it run an older launcher, or nothing, until a start or a press of ` +
      'the entry writes it.',
  }
}

/**
 * AT EVERY START OF A LINUX OFFICE AN INSTALLER MADE, THE HOOK LINES AN OLDER VERSION WROTE ARE WRITTEN AGAIN (see the
 * header). A line is written again only when it is exactly the line a press wrote with the Node the office carried
 * then, at `theShippedNodeIn` in its folder, and only when that Node is no longer there. Every other line and every
 * other key in the file is left as it was, and the file is copied under a free backup name first, as a press copies it.
 * Nothing is read in an AppImage, whose lines run the launcher `keepTheAppImagesHookLauncher` writes again; in a
 * folder with no build stamp, which is a checkout; or where the install's own Node needs nothing set, which is Windows
 * and the Mac. src/server/index.ts calls this in its start and prints the line. When no line was found the answer is
 * null.
 * @param {string} checkout the office's own folder
 * @param {{ platform?: string }} [system] this computer's system unless a test names another
 * @param {string} [home] the home folder whose settings file is read, this process's own unless a test names another
 * @returns {Promise<{ written: boolean, line: string } | null>}
 */
export async function keepTheOlderHookLines(checkout, system = thisSystem(), home = theOwnersHome()) {
  if (theAppImageFolderHolding(checkout) !== null) return null
  if (!(await somethingIsAt(join(checkout, THE_BUILD_STAMP_FILE)))) return null
  const runs = whatTheLinesRun(checkout, true, system.platform)
  if (Object.keys(runs.environment).length === 0) return null
  const older = join(checkout, ...theShippedNodeIn(String(system.platform)))
  if (await somethingIsAt(older)) return null
  return afterThePressBefore(() => writeTheOlderLinesAgain(theEntryPaths(home, checkout), runs, older))
}

/**
 * The settings file read, and each hook line that names the older Node written again, as `keepTheOlderHookLines` says.
 * @param {ReturnType<typeof theEntryPaths>} paths
 * @param {ReturnType<typeof whatTheLinesRun>} runs what a press writes now
 * @param {string} older the Node the office carried before
 * @returns {Promise<{ written: boolean, line: string } | null>}
 */
async function writeTheOlderLinesAgain(paths, runs, older) {
  if (!(await somethingIsAt(paths.settingsPath))) return null
  const notLookedAt = `so no hook line naming the Node an older version of this office carried, ${older}, was looked for`
  /** @type {unknown} */
  let settings
  try {
    settings = JSON.parse(await readFile(paths.settingsPath, 'utf8'))
  } catch (err) {
    return { written: false, line: `The settings file could not be read as JSON, ${notLookedAt}: ${paths.settingsPath} (${String(err)}).` }
  }
  /** @type {Map<string, string>} */
  const writtenAgain = new Map()
  for (const mode of /** @type {const} */ (['start', 'stop', 'end'])) {
    writtenAgain.set(theEntryCommand(runs.hook, mode, older), theEntryCommand(runs.hook, mode, runs.node, runs.environment))
  }
  let found = 0
  const hooks = /** @type {{ hooks?: Record<string, unknown> } | null} */ (settings)?.hooks
  for (const name of ['SessionStart', 'Stop', 'SessionEnd']) {
    const array = hooks?.[name]
    if (!Array.isArray(array)) continue
    for (const group of array) {
      const inGroup = /** @type {{ hooks?: unknown } | null} */ (group)?.hooks
      if (!Array.isArray(inGroup)) continue
      for (const hook of inGroup) {
        const line = /** @type {{ command?: unknown } | null} */ (hook)
        const now = typeof line?.command === 'string' ? writtenAgain.get(line.command) : undefined
        if (line === null || now === undefined) continue
        line.command = now
        found += 1
      }
    }
  }
  if (found === 0) return null
  const lines = found === 1 ? 'one hook line' : `${String(found)} hook lines`
  const copied = await copyUnderAFreeNameWithoutHoldingTheThread(paths.settingsPath, paths.backupPath)
  if ('failed' in copied) {
    return {
      written: false,
      line:
        `The settings file could not be backed up at ${copied.path} (${String(copied.failed)}), so ${lines} in ` +
        `${paths.settingsPath} still run the session hook with ${older}, which is gone, and run nothing.`,
    }
  }
  const temporary = `${paths.settingsPath}.mole-office-${String(process.pid)}`
  try {
    await writeFile(temporary, `${JSON.stringify(settings, null, 2)}\n`, 'utf8')
    await rename(temporary, paths.settingsPath)
  } catch (err) {
    try {
      await rm(temporary, { force: true })
    } catch {
      // The temporary file was already gone, which is the outcome that was wanted.
    }
    const copyLeft = await takeTheCopyAwayWithoutHoldingTheThread(copied.path)
    return {
      written: false,
      line:
        `The settings file could not be written, so ${lines} in it still run the session hook with ${older}, which is ` +
        `gone, and run nothing: ${paths.settingsPath} (${String(err)}).${copyLeft}`,
    }
  }
  return {
    written: true,
    line:
      `The Node an older version of this office carried, ${older}, is gone, so ${lines} in ${paths.settingsPath} that ` +
      `ran the session hook with it now run it with ${runs.theNode}, ${String(runs.node)}. ` +
      `${whereTheOldFileIs(copied.path, paths.backupPath)} Every other line in that file was left as it was.`,
  }
}

/**
 * AN APPIMAGE'S TWO FILES WRITTEN AGAIN BY ITS PRESS, before the skill link and the hook lines lead to them: the copy
 * of its skill, then its hook launcher. A refusal, or null when both are written.
 * @param {ReturnType<typeof theEntryPaths>} paths
 * @param {string} folder the AppImage's own folder, which the office runs in
 * @param {{ hook: string, node: string | null, environment?: Record<string, string> }} runs the hook and the Node in that folder
 * @returns {Promise<EntryRefused | null>}
 */
async function writeTheAppImagesFiles(paths, folder, runs) {
  const nothingElse = `The skill link was not written. No hook line was written, and ${paths.settingsPath} was not changed.`
  const copy = theAppImagesSkillCopy()
  const notCopied = await writeTheSkillCopy(paths.skillSource, copy)
  if (notCopied !== null) {
    return {
      ok: false,
      refused: true,
      path: copy,
      says: `The copy of this office's skill could not be written at ${copy} (${notCopied}). ${nothingElse}`,
    }
  }
  const launcher = theAppImagesHookLauncher()
  const notWritten = await writeTheHookLauncher(folder, runs, launcher)
  if (notWritten !== null) {
    return {
      ok: false,
      refused: true,
      path: launcher,
      says:
        `The copy of this office's skill was written again at ${copy}, but its hook launcher could not be written at ` +
        `${launcher} (${notWritten}). ${nothingElse}`,
    }
  }
  return null
}

/**
 * WHAT AN APPIMAGE'S PRESS DID AND SAYS, once the copy, the launcher, the skill link and any hook line are written.
 * @param {ReturnType<typeof theEntryPaths>} paths
 * @param {{ folder: string, runs: { hook: string, node: string | null },
 *   need: { createdSkillLink: boolean, replacedSkillLink: boolean },
 *   added: { addedSessionStart: boolean, addedStop: boolean, addedSessionEnd: boolean },
 *   backupPath: string | null }} done the AppImage's folder, what the launcher runs, what the link needed, the hook
 *   lines added, and where the file they replaced is kept
 * @returns {EntryInstalled}
 */
function theAppImagesEntry(paths, done) {
  const copy = theAppImagesSkillCopy()
  const launcher = theAppImagesHookLauncher()
  const { createdSkillLink, replacedSkillLink } = done.need
  const theCopy = createdSkillLink
    ? `Wrote a copy of this office's skill at ${copy}, from ${paths.skillSource}, and the skill link ${paths.skillLink}, linking it to that copy.`
    : replacedSkillLink
      ? `Wrote a copy of this office's skill at ${copy}, from ${paths.skillSource}, and the skill link ${paths.skillLink}, ` +
        'which pointed somewhere else, linking it to that copy.'
      : `Wrote the copy of this office's skill again at ${copy}, from ${paths.skillSource}. The skill link ${paths.skillLink} ` +
        'already leads to that copy.'
  const added = theLinesInWords(done.added)
  const theLines = added.length === 0
    ? `The three hook lines in ${paths.settingsPath} already run that launcher, so that file was not changed.`
    : `Wrote ${added.join(', ')} into ${paths.settingsPath}, each running that launcher with ${THE_LAUNCHERS_SHELL}. ` +
      `${whereTheOldFileIs(done.backupPath, paths.backupPath)} Every other line in that file was left as it was.`
  return {
    ok: true,
    changed: true,
    settingsPath: paths.settingsPath,
    backupPath: done.backupPath,
    skillLink: paths.skillLink,
    skillSource: copy,
    ...done.added,
    createdSkillLink,
    replacedSkillLink,
    says:
      `${theCopy} Wrote the hook launcher at ${launcher}, which runs ${done.runs.hook} with ${String(done.runs.node)}. ` +
      `${theLines} This office runs from an AppImage, in the folder ${done.folder}. That folder is the AppImage's, not the ` +
      "office's, and a later start can run in another one. With FUSE, each start mounts the AppImage at a new folder. " +
      'With APPIMAGE_EXTRACT_AND_RUN, the AppImage is unpacked to a temporary folder, and a new version is unpacked to ' +
      "another one. So the link leads to a copy in the office's own data folder, and the office writes the copy again " +
      'from its own skill at every start and at every press of this entry. The hook lines run the launcher, which is in ' +
      'the same data folder and is written again at the same moments. While the folder it names is gone, as it is after ' +
      "a stop, or is not safe to run from, the launcher says at a session's start that the session is not on the record.",
  }
}

/** Whether a path exists, following a symlink, as `existsSync` answers.
 * @param {string} path
 * @returns {Promise<boolean>}
 */
async function somethingIsAt(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/** Whether a path exists without following a symlink, so a broken link still counts as there.
 * @param {string} path
 * @returns {Promise<boolean>}
 */
async function lstatExists(path) {
  try {
    await lstat(path)
    return true
  } catch {
    return false
  }
}

/**
 * A link to the folder `target`, made at `path` as this system makes one: a symbolic link on Linux
 * and the Mac, a directory junction on Windows. Node reads a junction back as a symbolic link, and
 * its target as the whole path of the folder. It was made on a Windows 11 machine in wave 13t, round W15.
 * @param {string} target
 * @param {string} path
 * @param {'a-symbolic-link' | 'a-junction'} by
 */
async function linkTheFolder(target, path, by) {
  if (by === 'a-junction') await symlink(target, path, 'junction')
  else await symlink(target, path)
}

/** The target of a symlink, or null when it cannot be read.
 * @param {string} path
 * @returns {Promise<string | null>}
 */
async function readLink(path) {
  try {
    return await readlink(path)
  } catch {
    return null
  }
}

// ============================================================================================
// THE OTHER RUNTIMES' GLOBAL ENTRY: CODEX AND OPENCODE
// ============================================================================================
//
// The skill is linked into ./claude/skill, and the other agents' skills are linked too, because
// Mole Office should be a global skill. Claude Code's half is the skill link and the three
// hook lines above. Codex and OpenCode have no "skill" that loads by relevance; the nearest thing
// either has is a global instructions file that is ALWAYS read, so the entry for them is a short
// pointer into that file rather than a copy of the skill.
//
// WHERE EACH ONE READS ITS GLOBAL FILE, verified against each tool's own published documentation
// on 14 September 2026 — not measured on this machine the way `theOwnersHome()` above reads a live
// value, because neither tool has a command that prints this answer back:
//
//   The two paths, what was read from whose documentation, and the file's own name live in
//   `src/worker/rules.ts` beside the one function that writes such a file — `tests/one-set-of-rules.test.ts`
//   holds that one place writes a runtime's rules file, and this press asks rather than knowing.
//
// NEITHER DIRECTORY IS CREATED FROM NOTHING. If the tool's own home is not on this machine, this
// machine has never run it, and inventing the directory for a program nothing installed is not this
// door's place — see `planOtherRuntimeEntry` below, which refuses rather than guesses.
//
// ONLY THE PERSON MAY PRESS THIS, THE SAME AS THE ENTRY ABOVE. `src/server/api/entry.ts` puts the
// same `onlyThePersonMayInstallTheEntry` guard on the route that calls `pressTheOtherRuntimesEntry`,
// because `~/.codex` and `~/.config/opencode` are their directories and no agent decides for them what
// is in them. `GET .../other-runtimes` is the plan, open to
// anyone, and it writes nothing; only the POST, which only they may press, calls `pressTheOtherRuntimesEntry`.

/** Which runtime this target is for. */
export const OTHER_RUNTIMES = /** @type {const} */ (['codex', 'opencode'])

/** One line at the top and one at the bottom of the block this entry owns inside a shared file. */
export const OTHER_RUNTIME_BLOCK_START = '<!-- mole-office:start -->'
export const OTHER_RUNTIME_BLOCK_END = '<!-- mole-office:end -->'

/**
 * THE BLOCK ITSELF: A POINTER, NOT A COPY OF THE SKILL.
 *
 * Codex and OpenCode load their global file into every session's instructions, always — not only
 * when a description like the skill's own says it is relevant. Codex's own guidance is to keep that
 * file lean, because unneeded text there crowds out useful context on every run on this machine,
 * not only runs that touch Mole Office. So this is a few sentences, not the 3,000-token core: enough
 * to say Mole Office may be running and how to find out, nothing more.
 *
 * @returns {string}
 */
export function otherRuntimeBlockText() {
  return [
    OTHER_RUNTIME_BLOCK_START,
    '## Mole Office',
    '',
    'This machine may be running Mole Office, a tracker for research done with AI agents, over HTTP ' +
      `(\`${settings().apiAddress}\` as this checkout declares it, or the address in \`MOLE_OFFICE_API\`). Before assuming ` +
      'it is not there, `GET /api/health` on that address; if it answers, `GET /api/onboarding` ' +
      'names the doors, the project and the first reads. State meant to outlive this conversation ' +
      'belongs there, not only in your own reply.',
    '',
    'This block is written by `tools/install-the-entry.mjs` in the Mole Office checkout; edit it ' +
      'there, not here — a second press updates this block in place and does not duplicate it.',
    OTHER_RUNTIME_BLOCK_END,
  ].join('\n')
}

/**
 * One runtime's global file, and the paths worked out from `home`.
 *
 * @typedef {object} OtherRuntimeTarget
 * @property {'codex' | 'opencode'} runtime
 * @property {string} installedName    The name a person reads: "Codex", "OpenCode".
 * @property {string} homeDirectory    The tool's own home directory. Must already exist.
 * @property {string} agentsPath       The global instructions file this entry writes.
 * @property {string | null} overridePath  A file that would make writing `agentsPath` pointless, or
 *                                          null where the tool has no such concept.
 */

/**
 * Both other runtimes' targets, worked out from one home directory.
 *
 * `CODEX_HOME` is read here because Codex's own `--help` and `doctor` name it as the value that
 * moves `~/.codex`; nothing in `src/config/install-the-entry.mjs` otherwise reads a variable a
 * caller could set to redirect a write, and this is not an exception to that — the value has to
 * agree with what Codex itself would read, or the block would be written somewhere Codex never
 * looks, which is the failure this whole file exists to avoid.
 *
 * @param {string} home
 * @returns {{ codex: OtherRuntimeTarget, opencode: OtherRuntimeTarget }}
 */
export function theOtherRuntimeTargets(home) {
  // THE PATHS AND THE FILE'S NAME COME FROM `src/worker/rules.ts`, which is the one place that
  // decides what goes into a file a runtime reads as its rules. This press decides whether to write
  // at all; it does not decide where, and it no longer knows the name.
  return theGlobalRulesTargets(home)
}

/**
 * The text strictly between this entry's markers, or null when the file does not carry them.
 *
 * @param {string} text
 * @returns {string | null}
 */
function blockWithin(text) {
  const start = text.indexOf(OTHER_RUNTIME_BLOCK_START)
  const end = text.indexOf(OTHER_RUNTIME_BLOCK_END)
  if (start === -1 || end === -1 || end < start) return null
  return text.slice(start, end + OTHER_RUNTIME_BLOCK_END.length)
}

/**
 * `text` with this entry's existing block replaced by `block`, everything else untouched.
 *
 * @param {string} text
 * @param {string} block
 * @returns {string}
 */
function withBlockReplaced(text, block) {
  const start = text.indexOf(OTHER_RUNTIME_BLOCK_START)
  const end = text.indexOf(OTHER_RUNTIME_BLOCK_END)
  return text.slice(0, start) + block + text.slice(end + OTHER_RUNTIME_BLOCK_END.length)
}

/**
 * WHAT WRITING THIS RUNTIME'S GLOBAL ENTRY WOULD DO, WITHOUT DOING IT.
 *
 * The dry run this project asks of any act that changes a file outside the database — see
 * `GET /api/import`'s own header for the same reasoning applied there. `applyOtherRuntimeEntry`
 * below returns this exact shape once it has actually written, so a caller reads one contract
 * either way.
 *
 * @param {OtherRuntimeTarget} target
 * @returns {Promise<{ ok: true, changed: boolean, path: string, says: string } | { ok: false, refused: true, path: string, says: string }>}
 */
export async function planOtherRuntimeEntry(target) {
  if (!(await somethingIsAt(target.homeDirectory))) {
    return {
      ok: false,
      refused: true,
      path: target.homeDirectory,
      says:
        `${target.installedName}'s own directory is not on this machine: ${target.homeDirectory}. This looks ` +
        `like ${target.installedName} has never been run here, and making the directory up for a tool nothing ` +
        'installed is not this door\'s place. Nothing was written.',
    }
  }
  if (target.overridePath !== null && (await somethingIsAt(target.overridePath))) {
    return {
      ok: false,
      refused: true,
      path: target.overridePath,
      says:
        `${target.overridePath} exists, and ${target.installedName} reads it INSTEAD of ${target.agentsPath} — ` +
        'writing the block there would sit unread. Add the block to the override file by hand if that is what ' +
        'is wanted. Nothing was written.',
    }
  }
  const already = (await somethingIsAt(target.agentsPath)) ? await readFile(target.agentsPath, 'utf8') : null
  const block = otherRuntimeBlockText()
  if (already !== null && blockWithin(already) !== null) {
    const upToDate = blockWithin(already) === block
    return {
      ok: true,
      changed: !upToDate,
      path: target.agentsPath,
      says: upToDate
        ? `${target.agentsPath} already carries this block, unchanged. Pressing would write nothing.`
        : `${target.agentsPath} carries an older version of this block. Pressing would replace just that block, ` +
          'leaving the rest of the file as it is.',
    }
  }
  return {
    ok: true,
    changed: true,
    path: target.agentsPath,
    says:
      already === null
        ? `${target.agentsPath} does not exist. Pressing would create it, holding only this block.`
        : `${target.agentsPath} exists and does not carry this block. Pressing would APPEND it at the end, ` +
          'leaving the rest of the file exactly as it is.',
  }
}

/**
 * WRITE THIS RUNTIME'S GLOBAL ENTRY. Only ever called after `onlyThePersonMayInstallTheEntry`
 * upstream — see `src/server/api/entry.ts` — and only for a runtime the caller named explicitly.
 *
 * Backs the file up first when one already exists, under the first backup name nothing has, so a later
 * press never writes over the person's first backup (round W26). Writes through a temporary file in the
 * same directory and renames it, and changes nothing when the plan already says nothing would change.
 * A press refused at the write takes its copy away, or says where the copy still is.
 *
 * @param {OtherRuntimeTarget} target
 * @returns {Promise<{ ok: true, changed: boolean, path: string, backupPath: string | null, says: string } | { ok: false, refused: true, path: string, says: string }>}
 */
export async function applyOtherRuntimeEntry(target) {
  const plan = await planOtherRuntimeEntry(target)
  if (!plan.ok) return plan
  if (!plan.changed) return { ok: true, changed: false, path: plan.path, backupPath: null, says: plan.says }

  const already = (await somethingIsAt(target.agentsPath)) ? await readFile(target.agentsPath, 'utf8') : ''
  const block = otherRuntimeBlockText()
  const nextText =
    blockWithin(already) !== null
      ? withBlockReplaced(already, block)
      : already.length === 0
        ? `${block}\n`
        : `${already.replace(/\s+$/, '')}\n\n${block}\n`

  const firstBackupPath = `${target.agentsPath}${ENTRY_BACKUP_SUFFIX}`
  /** @type {string | null} */
  let backupPath = null
  if (already.length > 0) {
    const copied = await copyUnderAFreeNameWithoutHoldingTheThread(target.agentsPath, firstBackupPath)
    if ('failed' in copied) {
      return {
        ok: false,
        refused: true,
        path: copied.path,
        says: `${target.agentsPath} could not be backed up, so nothing was written to it: ${String(copied.failed)}.`,
      }
    }
    backupPath = copied.path
  }

  try {
    // ONE PLACE WRITES A RUNTIME'S RULES FILE, and it is not this one. See the note in
    // `src/worker/rules.ts`; `tests/one-set-of-rules.test.ts` is what holds it.
    await writeGlobalRulesFile(target, nextText)
  } catch (err) {
    // A REFUSED PRESS LEAVES NO COPY OF ITS OWN, as the settings press leaves none.
    const copyLeft = backupPath === null ? '' : await takeTheCopyAwayWithoutHoldingTheThread(backupPath)
    return {
      ok: false,
      refused: true,
      path: target.agentsPath,
      says: `${target.agentsPath} could not be written, so nothing changed: ${String(err)}.${copyLeft}`,
    }
  }

  return {
    ok: true,
    changed: true,
    path: target.agentsPath,
    backupPath,
    says:
      `Wrote the Mole Office block into ${target.agentsPath}. ` +
      (backupPath === null ? 'There was no file there before.' : whereTheOldFileIs(backupPath, firstBackupPath)),
  }
}

/**
 * THE PRESS OF `POST /api/office/install-the-entry/other-runtimes`: WRITE THE NAMED RUNTIMES' ENTRY, ALL OR NOTHING.
 *
 * Every named runtime is planned before any is written, so a press naming both is not left with Codex written and
 * OpenCode refused. A partial press would report success for work that did not fully happen. The plans and the
 * writes run as one press, after the press before it in this process: a press that let another run between its
 * plans and its writes could find a file changed after it was planned.
 *
 * @param {{ codex: OtherRuntimeTarget, opencode: OtherRuntimeTarget }} targets
 * @param {ReadonlyArray<'codex' | 'opencode'>} runtimes
 * @returns {Promise<{ refused: { ok: false, refused: true, path: string, says: string } } | { written: Record<string, Awaited<ReturnType<typeof applyOtherRuntimeEntry>>> }>}
 *   the first plan that was refused, when nothing was written; or what each write did
 */
export async function pressTheOtherRuntimesEntry(targets, runtimes) {
  return afterThePressBefore(async () => {
    for (const runtime of runtimes) {
      const plan = await planOtherRuntimeEntry(targets[runtime])
      if (!plan.ok) return { refused: plan }
    }
    /** @type {Record<string, Awaited<ReturnType<typeof applyOtherRuntimeEntry>>>} */
    const written = {}
    for (const runtime of runtimes) {
      written[runtime] = await applyOtherRuntimeEntry(targets[runtime])
    }
    return { written }
  })
}

/**
 * Put the skill link back where it was when a later step refused.
 *
 * A link this install created is removed. A link it replaced is pointed at its previous target
 * again. A link it left alone is not touched, so this never removes something the install did not
 * make.
 *
 * @param {ReturnType<typeof theEntryPaths>} paths
 * @param {string | null} previousTarget
 * @param {boolean} touched
 * @param {'a-symbolic-link' | 'a-junction'} linkedBy
 */
async function putTheLinkBack(paths, previousTarget, touched, linkedBy) {
  if (!touched) return
  try {
    if ((await somethingIsAt(paths.skillLink)) || (await lstatExists(paths.skillLink))) await unlink(paths.skillLink)
    if (previousTarget !== null) await linkTheFolder(previousTarget, paths.skillLink, linkedBy)
  } catch {
    // The link could not be put back. The refusal that follows says nothing was written, and this
    // is the one case where that is not quite true; the settings file is untouched either way.
  }
}
