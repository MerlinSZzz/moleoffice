// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * A FILE ONLY THIS USER MAY READ AND WRITE, ON WINDOWS: ITS ACCESS LIST IS SET, THEN READ BACK.
 * ---------------------------------------------------------------------------------------------
 * WHAT IT IS
 * ---------------------------------------------------------------------------------------------
 * Linux and the Mac keep a key file private by the mode it is made with, 0600. Windows has no such
 * mode, and Node ignores the mode there. On Windows a file is private by its access list. A new file
 * takes the entries of its folder's list, and a folder outside the user's profile can let other
 * users read what is in it.
 * `set(path)` runs one PowerShell script on a file that is already there. The script gives the file
 * a list with one entry: this user, with full control. It takes away every entry the file took from
 * its folder, and the file takes no more from it. Then it reads the list back from Windows, and
 * `whatTheListSays` checks what was read. A list that is not exactly that one entry is refused in
 * words, and so is a script that did not run or did not finish.
 * NO ADMINISTRATOR IS NEEDED. The user who makes a file owns it, and the owner of a file may always
 * change its list. The script writes only the list, not the owner, so it needs no privilege.
 * THE LIST IS READ BY SECURITY IDENTIFIER, NOT BY NAME. Windows spells an account's name in the
 * language it is set to, and an identifier is the same in every language.
 * THE PATH TRAVELS AS BASE64. PowerShell reads a curly quote as a quote mark too, so a path quoted
 * in the script could end its string early.
 * WHAT IT DOES NOT STOP. An administrator may take the ownership of any file and then read it, as
 * root may read a 0600 file on Linux.
 * It is read on Linux, with a stand-in for PowerShell, in
 * tests/a-key-file-on-windows-is-only-this-users.test.ts.
 */

import { theRealWindowsCommands } from './windows-commands.mjs'

/**
 * @typedef {import('./windows-commands.mjs').WindowsCommands} WindowsCommands
 */

/**
 * What setting a file's list did: done, or refused in words.
 * @typedef {{ ok: true } | { ok: false, says: string }} WhatSettingTheListDid
 */

/** What Windows calls full control of a file, as a number: every right a file has. */
export const FULL_CONTROL = 2_032_127

/**
 * The script that gives the file at `path` a list with one entry, this user's, and reads it back.
 * It prints `me <identifier>`, `protected <True|False>`, and one `entry` line for each entry of the
 * list read back: its identifier, Allow or Deny, its rights as a number, and whether it was taken
 * from the folder.
 * @param {string} path
 * @returns {string}
 */
export function theScriptThatMakesAFilePrivate(path) {
  const encoded = Buffer.from(path, 'utf8').toString('base64')
  return [
    "$ErrorActionPreference = 'Stop'",
    'try {',
    `  $path = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${encoded}'))`,
    '  $me = [System.Security.Principal.WindowsIdentity]::GetCurrent().User',
    '  $list = New-Object System.Security.AccessControl.FileSecurity',
    '  $list.SetAccessRuleProtection($true, $false)',
    '  $list.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($me, [System.Security.AccessControl.FileSystemRights]::FullControl, [System.Security.AccessControl.AccessControlType]::Allow)))',
    '  [System.IO.File]::SetAccessControl($path, $list)',
    '  $back = [System.IO.File]::GetAccessControl($path)',
    '  "me $($me.Value)"',
    '  "protected $($back.AreAccessRulesProtected)"',
    '  foreach ($entry in $back.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier])) {',
    '    "entry $($entry.IdentityReference.Value) $($entry.AccessControlType) $([int]$entry.FileSystemRights) $($entry.IsInherited)"',
    '  }',
    '} catch {',
    '  [Console]::Error.WriteLine($_.Exception.Message)',
    '  exit 1',
    '}',
  ].join('\n')
}

/**
 * What the list read back says: null when it is exactly one entry, for this user, allowing full
 * control, set on the file and not taken from its folder, with the folder's entries shut out. Any
 * other answer is the reason in words.
 * @param {string} printed what the script printed
 * @returns {string | null}
 */
export function whatTheListSays(printed) {
  const lines = printed.split(/\r?\n/u).map((line) => line.trim()).filter((line) => line !== '')
  const me = lines.find((line) => line.startsWith('me '))?.slice('me '.length)
  if (me === undefined || me === '') return 'Windows did not say which user this is'
  if (!lines.includes('protected True')) return 'its access list still takes entries from its folder'
  const entries = lines.filter((line) => line.startsWith('entry ')).map((line) => line.split(' '))
  if (entries.length !== 1) return `its access list has ${String(entries.length)} entries, not one`
  const [, who, type, rights, inherited] = /** @type {string[]} */ (entries[0])
  if (who !== me) return `its one entry is for ${String(who)}, not for this user (${me})`
  if (type !== 'Allow') return `its one entry is ${String(type)}, not Allow`
  if (Number(rights) !== FULL_CONTROL) return `its one entry gives the rights ${String(rights)}, not full control (${String(FULL_CONTROL)})`
  if (inherited !== 'False') return 'its one entry was taken from its folder'
  return null
}

/**
 * How Windows makes a file private, for the system layer: by its access list.
 * @param {WindowsCommands} [commands] the PowerShell to run, which a test stands in
 * @returns {{ by: 'its-access-list', set: (path: string) => WhatSettingTheListDid }}
 */
export function windowsPrivateFiles(commands = theRealWindowsCommands()) {
  return {
    by: 'its-access-list',
    set(path) {
      const did = commands.powershell(theScriptThatMakesAFilePrivate(path))
      if (!did.ran) return { ok: false, says: `its access list could not be set: ${did.reason}` }
      if (did.status !== 0) {
        const first = did.stderr.split(/\r?\n/u).find((line) => line.trim() !== '') ?? `PowerShell ended with ${String(did.status)}`
        return { ok: false, says: `its access list could not be set: ${first.trim().slice(0, 300)}` }
      }
      const wrong = whatTheListSays(did.stdout)
      if (wrong !== null) return { ok: false, says: `its access list was set, but what Windows read back is not this user's alone: ${wrong}` }
      return { ok: true }
    },
  }
}
