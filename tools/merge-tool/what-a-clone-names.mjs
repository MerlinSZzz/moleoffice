// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A CLONE IN A SANDBOX FOLDER NAMES FOR GIT TO RUN, read before the merge tool runs any git command in it.
 *
 * The merge tool's clones sit in the entry's sandbox folder, and the sandbox can write them. Git reads a clone's own
 * config and its info/attributes, and a filter, a merge driver or a diff command named there runs whenever git compares
 * or writes a file of the work tree: checkout, rebase, add, commit, read-tree, status, merge. The merge tool runs those
 * on the host, so a program the clone named would run there as the owner's user. Until they run inside the sandbox's
 * own container, git.mjs asks this before every command in the clone, and stops when the clone names anything but the
 * tool's own merge drivers.
 *
 * IT IS READ WITHOUT GIT RUNNING ANYTHING: `git config --file <file> --no-includes --null --list` for the clone's config
 * and its config.worktree, with the guard's overrides (src/config/guarded-git.mjs), and info/attributes as text. Once
 * those pass, the index is listed with `ls-files --stage`, which reads it alone.
 *
 * WHAT IS REFUSED, whatever its value:
 * - a filter, an include or includeIf, core.attributesFile, and any merge setting but the tool's own merge drivers, each
 *   with the command the tool writes, as list-join.mjs and journal-join.mjs make it;
 * - a diff driver's command or textconv, diff.external, and the other settings that name a program or a place:
 *   core.fsmonitor, core.hooksPath, core.pager, core.editor, core.sshCommand, core.askPass,
 *   core.alternateRefsCommand, core.gitProxy, core.worktree, sequence.editor, gpg.program, a credential helper, a
 *   remote's uploadpack, receivepack or vcs, and a partial clone, which fetches what it lacks;
 * - a url rewrite and a protocol setting, which together let a fetch by folder run a transport that starts a command.
 * git.mjs overrides several of these for its own commands, and lets git reach only a folder. The tools the merge tool
 * starts on a clone (the git checker, the related tests, the cloud suite) do neither, so all of them are refused here;
 * - an info/attributes line that sets anything but `merge=` one of the tool's own merge drivers;
 * - a submodule setting, and a submodule in the index. Git goes into a submodule the index holds on status, diff and
 *   add, and into one a commit holds on checkout when submodule.recurse is set, and there it runs what the
 *   submodule's own config names, which is not read here;
 * - a clone whose .git is not a folder, or which names another folder's config through commondir.
 *
 * WHAT THIS DOES NOT CLOSE: the sandbox can write the clone again between this check and git's start. Round 58 runs
 * these commands inside the sandbox's container.
 */

import './a-library-is-not-a-program.mjs'
import { existsSync, lstatSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { theIndexOf } from '../../src/config/outside-the-commit.mjs'
import { guardedGitBytes, guardedGitRun } from '../sandbox-git.mjs'
import { JOURNAL_JOIN_DRIVER, theJournalJoinCommand } from './journal-join.mjs'
import { LIST_JOIN_DRIVER, theListJoinCommand } from './list-join.mjs'
import { ACloneNamesAProgram } from './log-and-state.mjs'

/** Settings that name a program git starts, or a place it reads or writes, as `git config --list` spells them. */
const NAMES_A_PROGRAM_OR_A_PLACE = new Set([
  'core.attributesfile',
  'core.fsmonitor',
  'core.hookspath',
  'core.pager',
  'core.editor',
  'core.sshcommand',
  'core.askpass',
  'core.alternaterefscommand',
  'core.gitproxy',
  'core.worktree',
  'sequence.editor',
  'diff.external',
  'gpg.program',
  'extensions.partialclone',
])

/** The tool's own merge drivers in `clone`, each with the command it writes there. */
function theOwnDrivers(clone) {
  return new Map([
    [LIST_JOIN_DRIVER, theListJoinCommand(clone)],
    [JOURNAL_JOIN_DRIVER, theJournalJoinCommand(clone)],
  ])
}

/** Why `key` set to `value` is refused in `clone`, or null. */
function whyASettingIsRefused(key, value, own) {
  const [section = '', ...rest] = key.split('.')
  const variable = rest.at(-1) ?? ''
  const named = rest.slice(0, -1).join('.')
  if (section === 'include' || section === 'includeif') return 'names another file of config for git to read'
  if (section === 'filter') return 'names a filter git runs on the files'
  if (section === 'merge') {
    if (own.has(named) && (variable === 'name' || (variable === 'driver' && value === own.get(named)))) return null
    return "is not one of the merge tool's own merge drivers as the tool writes them"
  }
  if (section === 'diff' && named !== '' && (variable === 'command' || variable === 'textconv')) return 'names a program git runs on a diff'
  if (section === 'remote' && ['uploadpack', 'receivepack', 'vcs'].includes(variable)) return 'names a program git runs for that remote'
  if (section === 'gpg' && variable === 'program') return 'names a program git runs to sign or check'
  if (section === 'credential' && variable === 'helper') return 'names a program git runs for a password'
  if (section === 'url' || section === 'protocol') return 'changes where git fetches from, or how'
  if (section === 'submodule') return 'makes git go into a submodule, whose own config is not read here'
  if (NAMES_A_PROGRAM_OR_A_PLACE.has(key)) return 'names a program git runs or a place git reads or writes'
  return null
}

/**
 * The settings in one config file, as [key, value] pairs, or a sentence when git could not read it. Git starts in `/`,
 * which is no repository, so it reads the file it is given and not the clone's config as well.
 */
function theSettingsIn(file) {
  const read = guardedGitRun('/', ['config', '--file', file, '--no-includes', '--null', '--list'], { timeout: 15_000 })
  if (read.error !== undefined || read.status !== 0) return { unread: (read.error?.message ?? read.stderr.trim()) || `exit ${String(read.status)}` }
  return {
    settings: read.stdout.split('\0').filter((one) => one !== '').map((one) => {
      const end = one.indexOf('\n')
      return end < 0 ? [one, undefined] : [one.slice(0, end), one.slice(end + 1)]
    }),
  }
}

/**
 * WHAT `clone` NAMES THAT THE MERGE TOOL WILL NOT RUN GIT ON ITS FILES WITH: `{ file, key, says }`, where `says` is one
 * sentence naming the key and the file, or null when it names only what the tool wrote there itself.
 */
export function whatTheCloneNames(clone) {
  const where = resolve(clone)
  const gitDir = join(where, '.git')
  const refused = (file, key, said) => ({ file, key, says: `${file} ${said}, so the merge tool ran no git command on the files of ${where}.` })
  let folder
  try {
    folder = lstatSync(gitDir).isDirectory()
  } catch {
    folder = false
  }
  if (!folder) return refused(gitDir, '.git', 'is not a folder, as it is in every clone the tool makes')
  if (existsSync(join(gitDir, 'commondir'))) return refused(join(gitDir, 'commondir'), 'commondir', "names another folder's config for git to read")
  const own = theOwnDrivers(clone)
  for (const name of ['config', 'config.worktree']) {
    const file = join(gitDir, name)
    if (!existsSync(file)) continue
    const read = theSettingsIn(file)
    if ('unread' in read) return refused(file, name, `could not be read by git (${read.unread})`)
    for (const [key, value] of read.settings) {
      const why = whyASettingIsRefused(key, value, own)
      if (why !== null) return refused(file, key, `sets ${key}, which ${why}`)
    }
  }
  const attributes = join(gitDir, 'info', 'attributes')
  if (existsSync(attributes)) {
    const allowed = new RegExp(`^\\S+ merge=(?:${[...own.keys()].join('|')})$`, 'u')
    const lines = readFileSync(attributes, 'utf8').split('\n')
    for (const [index, line] of lines.entries()) {
      if (line.trim() === '' || line.startsWith('#') || allowed.test(line)) continue
      return refused(attributes, line, `line ${String(index + 1)} reads ${JSON.stringify(line.slice(0, 200))}, which sets something other than one of the merge tool's own merge drivers`)
    }
  }
  const index = join(gitDir, 'index')
  let entries
  try {
    entries = theIndexOf(where, (args, options) => guardedGitBytes(where, args, { ...options, timeout: 15_000 }))
  } catch (error) {
    return refused(index, 'index', `could not be read by git (${String(error?.stderr ?? '').trim() || String(error?.message ?? error)})`)
  }
  const submodule = entries.find(({ mode }) => mode === '160000')
  if (submodule !== undefined) return refused(index, submodule.path, `holds a submodule at ${submodule.path}, which git would go into with that submodule's own config`)
  return null
}

/** Throws when `clone` names a program; the error carries the sentence, and the entry bounces with it while integrating. */
export function checkTheCloneFirst(clone) {
  const named = whatTheCloneNames(clone)
  if (named !== null) throw new ACloneNamesAProgram(named.says, named.file, named.key)
}
