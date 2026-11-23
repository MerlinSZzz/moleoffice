// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SANDBOXES' LOGINS: WHICH MODEL LOGINS THE SANDBOXES ARE HANDED, SET ON THE SETTINGS PAGE. A
 * decision, on a message, says the codex and OpenCode Go quotas
 * are used inside the sandboxes too. It amends an earlier decision for the sandboxes.
 * A message on the proposal `_pv8hzTmFjO5` adds that the person pastes a login into a box on the Settings page
 * once, and the office writes it into the sandboxes' secrets file.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS READ, AND WHAT IS WRITTEN
 * ---------------------------------------------------------------------------------------
 *
 * The sandbox templates, sandboxes/<template>/sandbox.json, declare the names a sandbox may be handed, which program
 * reads each (`secrets.names[].readBy`), and the one file they come from (`secrets.hostFile`, `~` meaning the home
 * folder). tools/sandbox.mjs hands each run only the names its runtime reads. This module reads the same declaration,
 * answers each declared name as set or not set, and writes one name's line when the person sets or clears it. It
 * never returns a value, and it writes no name the templates do not declare: a name nothing reads would be a secret
 * kept for nobody.
 *
 * THIS IS NOT THE OFFICE COPYING A RUNTIME'S LOGIN. The value is what the person typed into the page, and the office
 * does not read any tool's own store to find one. What a decision says about that still holds.
 *
 * ---------------------------------------------------------------------------------------
 * THE FILE IS WRITTEN WHOLE, AND AT 0600 FROM THE FIRST BYTE
 * ---------------------------------------------------------------------------------------
 *
 * Every other line is kept as it was. The file also holds the Claude login the owner made with `claude setup-token`,
 * which this office never shows and never changes unless the owner sets that name here. The new file is written beside the
 * old one, created with mode 0600, and renamed over it, so a reader never sees half a file and the file never exists
 * with a wider mode. tools/sandbox-common.mjs refuses to pass on any line of a file that others can read, so a file
 * found wider is named here, and the next write makes it 0600.
 */
import { chmodSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, statSync, writeSync } from 'node:fs'
import { dirname, join } from 'node:path'

import type { SandboxLoginOnScreen, SandboxLogins } from '@shared/sandbox-logins.ts'
import { REPO_ROOT } from '../../config/settings.mjs'
// THE HOME FOLDER, from the one place the office works it out.
import { theOwnersHome } from '../../config/install-the-entry.mjs'
import { PanelError } from './panel-error.ts'
import { THIS_PLATFORM, aFileModeSaysWhoMayRead } from '../../config/the-paths-of-a-system.mjs'

/** A name the templates may declare: the shape tools/sandbox-common.mjs accepts, and nothing else. */
const A_NAME = /^[A-Z_][A-Z0-9_]*$/

/** The longest login taken: longer than any key or token a provider hands out today. */
const THE_LONGEST_LOGIN = 4096

interface Declared {
  /** The file every template names, as written (`~` for the home folder), or null when they disagree. */
  hostFile: string | null
  /** Every template that names a file, for the sentence when they disagree. */
  files: string[]
  /** The names, in declaration order, with every program that reads each. */
  names: { name: string; readBy: string[] }[]
}

/** THE TEMPLATES' DECLARATION, read from sandboxes/<template>/sandbox.json in this checkout. */
function theDeclaration(root = join(REPO_ROOT, 'sandboxes')): Declared {
  const files = new Set<string>()
  const names = new Map<string, Set<string>>()
  const templates = existsSync(root) ? readdirSync(root).filter((one) => existsSync(join(root, one, 'sandbox.json'))).sort() : []
  for (const template of templates) {
    let office: unknown
    try {
      office = JSON.parse(readFileSync(join(root, template, 'sandbox.json'), 'utf8'))
    } catch {
      continue
    }
    const secrets = (office as { secrets?: { hostFile?: unknown; names?: unknown } } | null)?.secrets
    if (typeof secrets?.hostFile !== 'string' || !Array.isArray(secrets.names)) continue
    files.add(secrets.hostFile)
    for (const one of secrets.names as unknown[]) {
      const name = (one as { name?: unknown } | null)?.name
      if (typeof name !== 'string' || !A_NAME.test(name)) continue
      const readBy = (one as { readBy?: unknown }).readBy
      const held = names.get(name) ?? new Set<string>()
      if (Array.isArray(readBy)) for (const program of readBy) if (typeof program === 'string') held.add(program)
      names.set(name, held)
    }
  }
  const all = [...files]
  return { hostFile: all.length === 1 ? (all[0] ?? null) : null, files: all, names: [...names].map(([name, readBy]) => ({ name, readBy: [...readBy].sort() })) }
}

/** The file on this machine, with `~` read as the home folder. */
function onThisMachine(hostFile: string, home: string): string {
  return hostFile.replace(/^~(?=\/)/, home)
}

/** The file's lines, or none when it is not there. */
function theLines(path: string): string[] {
  if (!existsSync(path)) return []
  const text = readFileSync(path, 'utf8')
  const lines = text.split('\n')
  if (lines[lines.length - 1] === '') lines.pop()
  return lines
}

/** Whether a line gives `name` a value, in the env-file form docker reads: `NAME=value`. */
function givesAValue(line: string, name: string): boolean {
  return line.startsWith(`${name}=`) && line.length > name.length + 1
}

/**
 * The sentence a file is called unsafe in when Windows's mode cannot say who may read it.
 * @param hostFile The file as the person declared it.
 * @returns The sentence.
 */
export function theModeCannotTellOnWindowsWords(hostFile: string): string {
  return `${hostFile} is on Windows, where Mole Office cannot yet tell who may read a file: Windows keeps that in the file's access list, which Mole Office does not read, and not in a mode.`
}

/**
 * The sentence a file is called unsafe in when others can read it, with the mode that says so.
 * @param hostFile The file as the person declared it.
 * @param mode The file's mode, whose low nine bits say who may read it.
 * @returns The sentence.
 */
export function othersCanReadTheFileWords(hostFile: string, mode: number): string {
  return `${hostFile} can be read by others (mode ${mode.toString(8)}), so the launcher passes none of it into a sandbox. The next login set here writes it back at 600.`
}

/**
 * A sentence when others can read the file, which the launcher refuses; null when they cannot or it is not there.
 *
 * ON WINDOWS THE MODE CANNOT ANSWER. Node reports every file there as readable by everybody, mode 666, and who may
 * read a file is kept in its access list instead, which nothing here reads. So it says it cannot tell, rather than
 * call every file readable by others (report bknY4s0NBTAT, item 10).
 */
export function whyItIsUnsafe(path: string, hostFile: string, platform: string = THIS_PLATFORM): string | null {
  if (!existsSync(path)) return null
  if (!aFileModeSaysWhoMayRead(platform)) {
    return theModeCannotTellOnWindowsWords(hostFile)
  }
  const mode = statSync(path).mode & 0o777
  if ((mode & 0o077) === 0) return null
  return othersCanReadTheFileWords(hostFile, mode)
}

/** WHAT THE SECTION DRAWS: each declared name, set or not set, and never a value. */
export function theSandboxLogins(home: string = theOwnersHome()): SandboxLogins {
  const declared = theDeclaration()
  if (declared.hostFile === null) {
    return {
      file: null,
      unsafe: null,
      names: declared.names.map((one) => ({ ...one, set: false })),
      says:
        declared.files.length === 0
          ? 'No sandbox template names a secrets file, so no login can be set here.'
          : `The sandbox templates name more than one secrets file (${declared.files.join(', ')}), so none is written here until they name one.`,
    }
  }
  const path = onThisMachine(declared.hostFile, home)
  const lines = theLines(path)
  const names: SandboxLoginOnScreen[] = declared.names.map((one) => ({ ...one, set: lines.some((line) => givesAValue(line, one.name)) }))
  const set = names.filter((one) => one.set).length
  return {
    file: declared.hostFile,
    unsafe: whyItIsUnsafe(path, declared.hostFile),
    names,
    says: `${String(set)} of the ${String(names.length)} logins the sandbox templates declare ${set === 1 ? 'is' : 'are'} set in ${declared.hostFile}.`,
  }
}

/** THE FILE WRITTEN WHOLE: a new file at 0600 beside the old one, flushed, then renamed over it. */
function writeWhole(path: string, lines: string[]): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  const next = `${path}.${String(process.pid)}.${String(Date.now())}.new`
  const fd = openSync(next, 'wx', 0o600)
  try {
    writeSync(fd, lines.length === 0 ? '' : `${lines.join('\n')}\n`)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  chmodSync(next, 0o600)
  renameSync(next, path)
}

/** The declared name and its file, or the refusal for a name nothing declares. `nothing` ends each refusal. */
function aDeclaredName(name: string, home: string, nothing = 'Nothing was changed.'): { path: string; hostFile: string } {
  const declared = theDeclaration()
  if (declared.hostFile === null) {
    throw new PanelError(`${theSandboxLogins(home).says} ${nothing}`, 409)
  }
  if (!declared.names.some((one) => one.name === name)) {
    throw new PanelError(
      `${JSON.stringify(name)} is not a login the sandbox templates declare (${declared.names.map((one) => one.name).join(', ')}). A name ` +
        `nothing reads would be a secret kept for nobody. ${nothing}`,
    )
  }
  return { path: onThisMachine(declared.hostFile, home), hostFile: declared.hostFile }
}

/**
 * THE LINE THAT GIVES A DECLARED NAME ITS VALUE, or the refusal for a name nothing declares or the file does not set.
 * When the file was edited by hand and gives the name twice, the last line is the one read: when docker reads an env
 * file, a later line replaces an earlier one. That was measured with docker 29.2.1 on 23 Nov 2026, also when the
 * earlier line is empty. A line with no value, `NAME=` and nothing after it, is skipped, as the launcher skips it.
 */
function theLineThatSetsIt(name: string, home: string): string {
  const { path, hostFile } = aDeclaredName(name, home, 'Nothing was sent.')
  const line = theLines(path).filter((one) => givesAValue(one, name)).at(-1)
  if (line === undefined) {
    throw new PanelError(`The sandboxes' login ${name} is not set in ${hostFile}, so there is nothing to test. Nothing was sent.`, 409)
  }
  return line
}

/**
 * WHETHER THE TEST PRESS MAY TEST THIS NAME: it answers nothing, and refuses a name the templates do not declare (400)
 * and a declared name the file does not set (409). The press asks it before it asks whether a test is known for the
 * name, so a name with no test is refused the same way.
 */
export function aSandboxLoginThatIsSet(name: string, home: string = theOwnersHome()): void {
  theLineThatSetsIt(name, home)
}

/**
 * THE VALUE OF ONE DECLARED LOGIN THAT IS SET, FOR THE TEST PRESS ALONE. lib/sandbox-login-tests.ts is the one module
 * that imports it, and it puts the value only into the one request to the login's provider. No door imports it, and
 * no reply, log line or sentence carries what it returns.
 */
export function theSandboxLoginToTest(name: string, home: string = theOwnersHome()): string {
  return theLineThatSetsIt(name, home).slice(name.length + 1)
}

/**
 * SET ONE LOGIN: its line is replaced, or added when there was none, and every other line is kept. The value is one
 * line; it is written and dropped, and the answer is the reading, which never carries it.
 */
export function setASandboxLogin(name: string, value: string, home: string = theOwnersHome()): SandboxLogins {
  const { path } = aDeclaredName(name, home)
  const login = value.trim()
  if (login === '') throw new PanelError(`The login for ${name} is empty, so it was not set. Nothing was changed.`)
  if (/[\r\n\0]/.test(login)) throw new PanelError(`A login is one line, and the one given for ${name} is not. Nothing was changed.`)
  if (login.length > THE_LONGEST_LOGIN) {
    throw new PanelError(`A login is at most ${String(THE_LONGEST_LOGIN)} characters, and the one given for ${name} is ${String(login.length)}. Nothing was changed.`)
  }
  const kept = theLines(path).filter((line) => !line.startsWith(`${name}=`))
  writeWhole(path, [...kept, `${name}=${login}`])
  return theSandboxLogins(home)
}

/** CLEAR ONE LOGIN: its line goes, and every other line is kept. Clearing one that is not set changes nothing. */
export function clearASandboxLogin(name: string, home: string = theOwnersHome()): SandboxLogins {
  const { path } = aDeclaredName(name, home)
  const lines = theLines(path)
  const kept = lines.filter((line) => !line.startsWith(`${name}=`))
  if (kept.length !== lines.length) writeWhole(path, kept)
  return theSandboxLogins(home)
}

/** The established host secrets location, without reading any login values. */
export function sandboxSecretsHostFile(): string | null { return theDeclaration().hostFile }
