// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT'S OWN FOLDER: THE START FOLDER THE OFFICE MAKES FOR AN AGENT IT OPENS IN A TERMINAL WITH NONE RECORDED.
 * Wave 13s, round 205.
 *
 * WHERE IT IS. In `agents/` inside the office's data folder, the folder of the database this office opened, which
 * also holds the database and the office's key file. One folder per agent, named by its handle. So a test office's
 * agents get folders beside the test's database, and never beside the person's.
 *
 * WHAT IS IN IT. Nothing the office writes. The agent's harness keeps its own files there, and the agent still does its
 * work in the repositories and worktrees it goes into. The office tells which agent a session is by the folder it
 * started in, and its trust for Claude Code covers this folder only (claude-folder-trust.ts).
 *
 * WHO MAY OPEN IT. This user only. On Linux and the Mac that is the mode 0700. On Windows it is an access list with one
 * entry, this user's, passed on to what is made inside the folder, set and then read back. The list is read as the
 * key files' list is read (src/config/systems/windows-private-files.mjs). It is read here on Linux, with a stand-in
 * for PowerShell; only a run on a Windows computer can show that the script works there.
 *
 * WHAT IS REFUSED, IN WORDS, WITH NOTHING LEFT MADE:
 *   - a handle that breaks the handle rule, as an imported record's may;
 *   - a handle Windows keeps for a device (con, prn, aux, nul, com0 to com9, lpt0 to lpt9). The name is the same on
 *     every system, so it must be one every file system takes;
 *   - a data folder inside a git working tree, as a checkout's own data/ is. A folder there would belong to that
 *     repository: Claude Code would trust the repository, and Codex would read its instructions;
 *   - an `agents` folder or an agent's folder that is a link or not a folder, or, on Linux and the Mac, one that is
 *     not this user's alone.
 *
 * A folder already there and this user's alone is used as it is. Only the two folders are made, each without
 * `recursive`, so nothing is made outside the data folder. A handle is free again once its agent is retired, so the
 * caller refuses a folder another agent's record names (terminal-agents.ts): two agents never share one.
 */

import { chmodSync, lstatSync, mkdirSync, realpathSync, rmdirSync } from 'node:fs'
import { join } from 'node:path'
import { whyHandleIsRefused } from '@shared/participants.ts'
import { theGitTreeHolding } from '../../../config/files-area.mjs'
import { databaseDirectoryFrom, settings } from '../../../config/settings.mjs'
import { thisSystem } from '../../../config/systems/the-system.mjs'
import { theRealWindowsCommands, type WindowsCommands } from '../../../config/systems/windows-commands.mjs'
import { whatTheListSays, type WhatSettingTheListDid } from '../../../config/systems/windows-private-files.mjs'

/** The folder inside the data folder that holds the agents' own folders. */
export const THE_AGENTS_OWN_FOLDERS = 'agents'

/** The names Windows keeps for devices, as a handle can spell them: lowercase, with no extension. */
const NAMES_WINDOWS_KEEPS = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/

/** What Windows says when an entry is passed on to the folders and the files made inside: ContainerInherit and ObjectInherit. */
const PASSED_ON_TO_WHAT_IS_INSIDE = 3

/** How a folder is made one only this user may open: by its mode, or by an access list a setter sets and reads back. */
export type AFolderIsMadePrivate = { by: 'its-mode' } | { by: 'its-access-list'; set: (path: string) => WhatSettingTheListDid }

/** Why a handle cannot name a folder on every file system, or null when it can. */
export function whyAHandleCannotNameAFolder(handle: string): string | null {
  const refused = whyHandleIsRefused(handle)
  if (refused !== null) return `its handle "${handle}" cannot name a folder, because it breaks the handle rule: ${refused}`
  if (NAMES_WINDOWS_KEEPS.test(handle)) return `Windows keeps the name "${handle}" for a device, so no folder may have it there`
  return null
}

/**
 * The script that gives the folder at `path` a list with one entry, this user's, passed on to what is made inside it,
 * and reads it back. It prints what the key files' script prints, with each entry's inheritance as a number after it.
 */
export function theScriptThatMakesAFolderPrivate(path: string): string {
  const encoded = Buffer.from(path, 'utf8').toString('base64')
  return [
    "$ErrorActionPreference = 'Stop'",
    'try {',
    `  $path = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${encoded}'))`,
    '  $me = [System.Security.Principal.WindowsIdentity]::GetCurrent().User',
    '  $list = New-Object System.Security.AccessControl.DirectorySecurity',
    '  $list.SetAccessRuleProtection($true, $false)',
    "  $inside = [System.Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit'",
    '  $list.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($me, [System.Security.AccessControl.FileSystemRights]::FullControl, $inside, [System.Security.AccessControl.PropagationFlags]::None, [System.Security.AccessControl.AccessControlType]::Allow)))',
    '  [System.IO.Directory]::SetAccessControl($path, $list)',
    '  $back = [System.IO.Directory]::GetAccessControl($path)',
    '  "me $($me.Value)"',
    '  "protected $($back.AreAccessRulesProtected)"',
    '  foreach ($entry in $back.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier])) {',
    '    "entry $($entry.IdentityReference.Value) $($entry.AccessControlType) $([int]$entry.FileSystemRights) $($entry.IsInherited) $([int]$entry.InheritanceFlags)"',
    '  }',
    '} catch {',
    '  [Console]::Error.WriteLine($_.Exception.Message)',
    '  exit 1',
    '}',
  ].join('\n')
}

/** How Windows makes a folder private: by its access list, set by one PowerShell script and read back. */
export function windowsPrivateFolders(commands: WindowsCommands = theRealWindowsCommands()): Extract<AFolderIsMadePrivate, { by: 'its-access-list' }> {
  return {
    by: 'its-access-list',
    set(path) {
      const did = commands.powershell(theScriptThatMakesAFolderPrivate(path))
      if (!did.ran) return { ok: false, says: `its access list could not be set: ${did.reason}` }
      if (did.status !== 0) {
        const first = did.stderr.split(/\r?\n/u).find((line) => line.trim() !== '') ?? `PowerShell ended with ${String(did.status)}`
        return { ok: false, says: `its access list could not be set: ${first.trim().slice(0, 300)}` }
      }
      const wrong = whatTheListSays(did.stdout)
      if (wrong !== null) return { ok: false, says: `its access list was set, but what Windows read back is not this user's alone: ${wrong}` }
      const entry = did.stdout.split(/\r?\n/u).map((line) => line.trim()).find((line) => line.startsWith('entry '))
      if (Number(entry?.split(' ')[5]) !== PASSED_ON_TO_WHAT_IS_INSIDE) {
        return { ok: false, says: 'its access list was set, but its one entry is not passed on to what is made inside it' }
      }
      return { ok: true }
    },
  }
}

/** How this system makes a folder private: as it makes a key file private, by the mode or by an access list. */
function thisSystemsWay(): AFolderIsMadePrivate {
  return thisSystem().aFileIsMadePrivate.by === 'its-mode' ? { by: 'its-mode' } : windowsPrivateFolders()
}

/** Make `path` a folder only this user may open, or check the one there. Answers whether it was made now. */
function aFolderOfThisUsersAlone(path: string, privately: AFolderIsMadePrivate): boolean {
  let madeNow = false
  try {
    mkdirSync(path, { mode: 0o700 })
    madeNow = true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw new Error(`${path} could not be made: ${(error as Error).message}`)
  }
  const stat = lstatSync(path)
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`${path} is there and is not a folder of its own`)
  if (privately.by === 'its-mode') {
    // THE MODE GIVEN TO mkdir IS NARROWED BY THE UMASK, so a folder made now is given 0700 whole.
    if (madeNow) chmodSync(path, 0o700)
    else if (process.getuid !== undefined && stat.uid !== process.getuid()) throw new Error(`${path} is there and belongs to another user`)
    else if ((stat.mode & 0o077) !== 0) throw new Error(`${path} is there and other users may open it (its mode is ${(stat.mode & 0o777).toString(8)})`)
    return madeNow
  }
  const set = privately.set(path)
  if (!set.ok) {
    // A FOLDER MADE NOW IS REMOVED, and a removal that fails is said beside the first reason, never in its place.
    let removal = ''
    if (madeNow) {
      try {
        rmdirSync(path)
      } catch (error) {
        removal = `; and it could not be removed: ${(error as Error).message}`
      }
    }
    throw new Error(`${path} could not be made this user's alone: ${set.says}${removal}`)
  }
  return madeNow
}

/**
 * THE AGENT'S OWN FOLDER, made when it is not there: `agents/<handle>` in the data folder of `databasePath`, which is
 * the database this office opened unless a caller names another. Answers the folder and whether this call made it.
 * Throws an Error whose message says why, in words, when the folder cannot be made or used.
 */
export function makeTheAgentsOwnFolder(
  handle: string,
  o: { databasePath?: string; privately?: AFolderIsMadePrivate } = {},
): { folder: string; madeNow: boolean } {
  const cannot = whyAHandleCannotNameAFolder(handle)
  if (cannot !== null) throw new Error(cannot)
  const data = databaseDirectoryFrom(o.databasePath ?? settings().databasePath)
  let real: string
  try {
    real = realpathSync(data)
  } catch (error) {
    throw new Error(`the office's data folder ${data} could not be read: ${(error as Error).message}`)
  }
  const tree = theGitTreeHolding(real)
  if (tree !== null) {
    throw new Error(`the office's data folder ${data} is inside the git working tree ${tree}, so a folder made there would belong to that repository`)
  }
  // THE FOLDER IS NAMED FROM THE DATA FOLDER'S REAL PATH, because that is the folder a program started there says it is
  // in, and the start hook matches a start folder on its exact spelling.
  const privately = o.privately ?? thisSystemsWay()
  aFolderOfThisUsersAlone(join(real, THE_AGENTS_OWN_FOLDERS), privately)
  const folder = join(real, THE_AGENTS_OWN_FOLDERS, handle)
  return { folder, madeNow: aFolderOfThisUsersAlone(folder, privately) }
}
