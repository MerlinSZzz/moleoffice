#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHECK A GIT CHANGESET PASSES: ITS GENERATED FILES REGENERATE BYTE FOR BYTE, AND WHAT IT
 * TOUCHES IN A PROTECTED AREA IS PUT IN FRONT OF THE INSPECTOR.
 *
 * ---------------------------------------------------------------------------------------
 * HOW TO RUN IT
 * ---------------------------------------------------------------------------------------
 *
 *   node tools/checks/git-changeset.mjs [--repo <dir>] [--base <ref>] [--head <ref>] [--scratch <dir>]
 *
 *   --repo     the repository under check; default the working directory.
 *   --base     what the change is measured against; default `main`. The queue passes the main it
 *              rebased onto.
 *   --head     the change; default `HEAD`. Only COMMITTED work is checked: an agent checking before
 *              it submits commits first, and the tool says on stderr when the tree has uncommitted
 *              changes it did not look at.
 *   --scratch  where the scratch copy is made; default ~/.cache/mole-office/checks. The copy is a
 *              directory this run creates and removes; nothing else there is touched.
 *
 * It prints the JSON and exits as tools/checks/verdict.mjs says.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT DECIDES AND WHAT IT HANDS ON
 * ---------------------------------------------------------------------------------------
 *
 * The paths the change touches are `git diff --name-status -M <base>...<head>`: what the branch
 * changed since it left the base, a rename touching both its old path and its new one. Each touched
 * path is read against the project's `.mole-office/protected.json` AS IT STANDS AT THE BASE
 * (tools/checks/protected-areas.mjs says why the base copy counts):
 *
 *   - A path a declared command generates is DECIDED by regeneration. The change's own tree is
 *     cloned into a scratch directory (`git clone --shared`, which writes nothing into the
 *     repository under check), the command runs there, and every file that command declares is
 *     compared byte for byte with what the change committed. R4: generated files are
 *     verified by regenerating and comparing, not by a whitelist of paths.
 *   - A path in a protected area that no command generates goes to `needsJudgment`, for the
 *     inspector to read. A rename goes there under its new path, with the reason naming the old
 *     one, because the inspector is handed only paths its own diff lists and its diff, like this
 *     one, sees a rename under its new name.
 *   - Anything else is not this tool's business and is not listed.
 *
 * A command runs only when the change touches one of its files. A test file added without the
 * audit table regenerated is therefore not a failure here: the merge queue regenerates the table on top
 * of a merge (.mole-office/protected.json), and a worker may not.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A GENERATOR IS GIVEN
 * ---------------------------------------------------------------------------------------
 *
 * The command is an argument list, run with no shell, in the scratch copy, as the leader of its own
 * process group, with fifteen minutes to finish. A first word of `node` means this Node, the one
 * running the checker. The scratch copy has the repository's `node_modules` linked in when the
 * repository has one. A scratch clone has no `.env`, so the checker passes the office's address
 * and project as MOLE_OFFICE_API and MOLE_OFFICE_WORKSPACE, resolved by tools/where-is-the-api.mjs
 * exactly as a tool run in this checkout would resolve them (the environment first, then `.env`).
 * What was passed is printed under `checked`. A generator that reads the office (Mole
 * Office's tools/rules-chapters.mjs reads the chapter records) only READS it; this checker writes
 * nothing to the office.
 *
 * A generator that fails, or does not finish, is a decided failure for every file it declares: the
 * file was not shown to be its output, and the detail carries the generator's own last words so a
 * reader can tell a broken change from an office that was not answering.
 */

import { spawn, execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

import { cannotRun, decide, exitTwoOnACrash, finish, needsJudgment, newVerdict, readFlags } from './verdict.mjs'
import { PROTECTED_AREAS_FILE, generatorOf, protectingPattern, readProtectedAreas } from './protected-areas.mjs'
import { whereIsTheApi, whichWorkspace } from '../where-is-the-api.mjs'
import { theOfficeKey } from '../../src/config/office-key.mjs'
import { stopAnUnpairedStableStart } from '../../src/config/the-office-tool-environment.mjs'

const TOOL = 'tools/checks/git-changeset.mjs'
const USAGE = 'Usage: node tools/checks/git-changeset.mjs [--repo <dir>] [--base <ref>] [--head <ref>] [--scratch <dir>]'

/** How long one generator may run before its process group is stopped. */
const GENERATOR_TIMEOUT_MS = 15 * 60 * 1000

/** How much of a generator's output is kept for the detail line. */
const KEEP_OUTPUT_CHARS = 4000

/**
 * The environment every git call and every generator gets: this process's, without the variables
 * that would point git somewhere else (a checker started from a git hook inherits GIT_DIR, and
 * every `git -C <scratch>` would then read the hook's repository instead).
 */
function cleanEnvironment(extra = {}) {
  const env = { ...process.env, ...extra }
  // The pairing a stable office's merge tool hands this guard is for its own key, never for a generator in the
  // scratch tree, whose settings would read the development .env (tools/merge-tool/arguments.mjs).
  for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_PREFIX', 'GIT_COMMON_DIR', 'GIT_OBJECT_DIRECTORY', 'MOLE_OFFICE_DEVELOPMENT_CHECKOUT']) {
    delete env[name]
  }
  return env
}

/** One git command's stdout, or throws with git's own words. */
function git(cwd, args, options = {}) {
  return execFileSync('git', ['-C', cwd, ...args], {
    env: cleanEnvironment(),
    encoding: options.encoding ?? 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 256 * 1024 * 1024,
  })
}

/** git's own complaint out of a failed execFileSync, one line. */
function gitSaid(err) {
  const said = String(err.stderr ?? err.message ?? err).trim().split('\n').filter(Boolean)
  return said[said.length - 1] ?? 'git failed and said nothing'
}

/** A commit id for a ref, or cannotRun naming the ref. */
function commitOf(repo, ref, flag) {
  try {
    return git(repo, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]).trim()
  } catch {
    return cannotRun(TOOL, `${flag} ${ref} is not a commit in ${repo}. Nothing was checked.`)
  }
}

/** The bytes of one file in the scratch tree, or null when it is not there. */
function bytesAt(tree, path) {
  const file = join(tree, path)
  return existsSync(file) ? readFileSync(file) : null
}

/** A short quotation of one line for a detail sentence. */
function quoted(line) {
  if (line === undefined) return '(the end of the file)'
  return JSON.stringify(line.length > 160 ? `${line.slice(0, 160)}…` : line)
}

/** Where two versions of one file first part, in words. */
function firstDifference(committed, regenerated) {
  const have = committed.toString('utf8').split('\n')
  const want = regenerated.toString('utf8').split('\n')
  let line = 0
  while (line < have.length && line < want.length && have[line] === want[line]) line += 1
  return `first difference at line ${String(line + 1)}: the change has ${quoted(have[line])}, the generator writes ${quoted(want[line])}`
}

/**
 * Run one generator in the scratch tree as the leader of its own process group.
 * Resolves with what happened; never rejects.
 */
function runGenerator(command, cwd, env) {
  return new Promise((done) => {
    const [first, ...rest] = command
    const program = first === 'node' ? process.execPath : first
    let output = ''
    let timedOut = false
    const keep = (chunk) => {
      output = (output + String(chunk)).slice(-KEEP_OUTPUT_CHARS)
    }
    let child
    try {
      child = spawn(program, rest, { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (err) {
      done({ status: null, signal: null, timedOut, output: err.message, leftBehind: false })
      return
    }
    child.stdout.on('data', keep)
    child.stderr.on('data', keep)
    const timer = setTimeout(() => {
      timedOut = true
      try {
        process.kill(-child.pid, 'SIGTERM')
      } catch {
        // The group is already gone, which is what the signal was for.
      }
    }, GENERATOR_TIMEOUT_MS)
    child.on('error', (err) => {
      clearTimeout(timer)
      done({ status: null, signal: null, timedOut, output: `${output}\n${err.message}`, leftBehind: false })
    })
    child.on('close', (status, signal) => {
      clearTimeout(timer)
      // A generator that started something and left it running is stopped by the group this run
      // recorded, never by a pattern (chapter 2), and the detail says so.
      let leftBehind = false
      try {
        process.kill(-child.pid, 0)
        leftBehind = true
        process.kill(-child.pid, 'SIGTERM')
      } catch {
        // Nothing of the group is alive.
      }
      done({ status, signal, timedOut, output, leftBehind })
    })
  })
}

/** The last non-empty line a generator printed, for a detail sentence. */
function lastWords(output) {
  const lines = output.trim().split('\n').filter((line) => line.trim() !== '')
  return lines.length === 0 ? 'it printed nothing' : `it said ${quoted(lines[lines.length - 1])}`
}

exitTwoOnACrash(TOOL)

// THE START CHECK (wave 13q), before the flags are read: a stable checkout at a dated stable tag started without the
// pairing would read its own defaults.
stopAnUnpairedStableStart()

const flags = readFlags(TOOL, process.argv.slice(2), ['--repo', '--base', '--head', '--scratch'], USAGE)
const baseRef = flags['--base'] ?? 'main'
const headRef = flags['--head'] ?? 'HEAD'

let repo
try {
  repo = git(resolve(flags['--repo'] ?? process.cwd()), ['rev-parse', '--show-toplevel']).trim()
} catch (err) {
  cannotRun(TOOL, `${resolve(flags['--repo'] ?? process.cwd())} is not inside a git repository (${gitSaid(err)}). Nothing was checked.`)
}

const base = commitOf(repo, baseRef, '--base')
const head = commitOf(repo, headRef, '--head')
let mergeBase
try {
  mergeBase = git(repo, ['merge-base', base, head]).trim()
} catch {
  cannotRun(TOOL, `${baseRef} and ${headRef} have no common ancestor in ${repo}, so there is no change to measure. Nothing was checked.`)
}

if (headRef === 'HEAD' && git(repo, ['status', '--porcelain']).trim() !== '') {
  process.stderr.write(
    `${TOOL}: ${repo} has uncommitted changes. They were not checked: this checks commit ${head.slice(0, 12)} only.\n`,
  )
}

// WHAT THE CHANGE DID, one entry per change, a rename carrying both of its paths. Git's rename
// detection is on, as it is for the inspector, which is handed only paths its own diff lists and
// refuses any other (whatNeedsJudgment in src/server/lib/inspection.ts). A rename is handed on under
// its new path, and the reason names the old one, so a file moved OUT of a protected area is still
// read: counted only by its new path, it would slip out unseen.
const fields = git(repo, ['diff', '--name-status', '-z', '-M', mergeBase, head]).split('\0')
/** @type {{ path: string, from: string | null }[]} */
const changes = []
for (let index = 0; index < fields.length && fields[index] !== ''; ) {
  const status = fields[index] ?? ''
  if (status.startsWith('R') || status.startsWith('C')) {
    changes.push({ path: fields[index + 2] ?? '', from: fields[index + 1] ?? '' })
    index += 3
  } else {
    changes.push({ path: fields[index + 1] ?? '', from: null })
    index += 2
  }
}
const touched = changes.flatMap((change) => (change.from === null ? [change.path] : [change.from, change.path]))

// THE RULES IN FORCE BEFORE THE CHANGE: the base's copy of the file, never the change's own.
let areas = { protected: [], generated: [] }
let configSaid = `none: ${baseRef} has no ${PROTECTED_AREAS_FILE}, so nothing is protected and no file is declared generated`
let configText = null
try {
  configText = git(repo, ['show', `${base}:${PROTECTED_AREAS_FILE}`])
} catch {
  configText = null
}
if (configText !== null) {
  try {
    areas = readProtectedAreas(configText, `${baseRef}:${PROTECTED_AREAS_FILE}`)
    configSaid = `${PROTECTED_AREAS_FILE} as it stands at ${baseRef} (${base.slice(0, 12)})`
  } catch (err) {
    cannotRun(TOOL, `${err.message} Nothing was checked.`)
  }
}

const verdict = newVerdict()
/** @type {{ paths: string[], command: string[] }[]} */
const toRegenerate = []
for (const change of changes) {
  const paths = change.from === null ? [change.path] : [change.from, change.path]
  for (const path of paths) {
    const generator = generatorOf(areas, path)
    if (generator !== null && !toRegenerate.includes(generator)) toRegenerate.push(generator)
  }
  const inProtectedAreas = paths
    .filter((path) => generatorOf(areas, path) === null)
    .map((path) => ({ path, pattern: protectingPattern(areas, path) }))
    .filter((one) => one.pattern !== null)
  if (inProtectedAreas.length === 0) continue
  const where = inProtectedAreas.map((one) => `${one.path} is in a protected area (${JSON.stringify(one.pattern)} in ${PROTECTED_AREAS_FILE})`).join(', and ')
  needsJudgment(
    verdict,
    change.path,
    change.from === null
      ? `It is in a protected area (${JSON.stringify(inProtectedAreas[0]?.pattern)} in ${PROTECTED_AREAS_FILE}) and no declared command generates it, so a program cannot say whether the change is right. Read it.`
      : `It was renamed from ${change.from} to ${change.path}; ${where}, and no declared command generates it, so a program cannot say whether the move is right. Read it.`,
  )
}

// The office's address and project, asked only when a generator will run. tools/where-is-the-api.mjs
// puts the real environment first, so a caller that sets MOLE_OFFICE_API gets exactly that.
const generatorEnvironment =
  toRegenerate.length > 0 ? { MOLE_OFFICE_API: whereIsTheApi(), MOLE_OFFICE_WORKSPACE: whichWorkspace() } : null

/**
 * THE OFFICE'S OWN KEY, HANDED TO A GENERATOR'S PROCESS AND TO NOTHING ELSE (problem MIbPzCfRUe14).
 *
 * A generator reads the office's records through the API, and once the key window is closed a read with no key is
 * refused, so no export of the rules could land. This guard is the office's own program, and
 * only the office's own programs send the office's key. So the guard reads the key
 * here, from the key file beside the database its own settings name, and gives it to the generator's process in the
 * two variables every tool of this checkout already reads for its key and its name (MOLE_AGENT_KEY and
 * MOLE_OFFICE_AGENT, through anAgentsToolHeaders in tools/sandbox-common.mjs). It is never printed, never put in
 * `generatorEnvironment` above, which is written into this guard's report, and never written into the tree. With no
 * key file there is no key, the generator's read is refused in words, and this guard says the export could not be
 * checked.
 */
function theKeyForAGenerator() {
  const held = theOfficeKey()
  return held.key === null ? {} : { MOLE_AGENT_KEY: held.key, MOLE_OFFICE_AGENT: 'mole-office/the-changeset-guard' }
}

const checked = {
  repo,
  base: { ref: baseRef, commit: base },
  head: { ref: headRef, commit: head },
  mergeBase,
  touched,
  config: configSaid,
  regenerated: toRegenerate.map((entry) => entry.command.join(' ')),
  generatorEnvironment,
}

if (toRegenerate.length > 0) {
  const scratchRoot = resolve(flags['--scratch'] ?? join(homedir(), '.cache', 'mole-office', 'checks'))
  let scratch
  try {
    mkdirSync(scratchRoot, { recursive: true })
    scratch = mkdtempSync(join(scratchRoot, 'git-changeset-'))
  } catch (err) {
    cannotRun(TOOL, `No scratch directory could be made under ${scratchRoot}: ${err.message}. Nothing was regenerated.`)
  }
  const tree = join(scratch, 'tree')
  try {
    try {
      git(scratch, ['clone', '--shared', '--no-checkout', '--quiet', repo, tree])
      git(tree, ['checkout', '--quiet', '--detach', head])
    } catch (err) {
      rmSync(scratch, { recursive: true, force: true })
      cannotRun(TOOL, `The change could not be copied into ${tree} (${gitSaid(err)}). Nothing was regenerated.`)
    }
    const modules = join(repo, 'node_modules')
    const linkModules = () => {
      if (existsSync(modules) && !existsSync(join(tree, 'node_modules'))) symlinkSync(realpathSync(modules), join(tree, 'node_modules'))
    }
    for (const [index, generator] of toRegenerate.entries()) {
      if (index > 0) {
        // Each generator runs on the change's own tree, never on what the one before it wrote.
        git(tree, ['reset', '--quiet', '--hard', head])
        git(tree, ['clean', '--quiet', '-fd'])
      }
      linkModules()
      const committed = new Map(generator.paths.map((path) => [path, bytesAt(tree, path)]))
      const said = generator.command.join(' ')
      const run = await runGenerator(generator.command, tree, cleanEnvironment({ ...generatorEnvironment, ...theKeyForAGenerator() }))
      const leftNote = run.leftBehind ? ' It left processes running in its group, and they were stopped.' : ''
      if (run.timedOut || run.status !== 0) {
        const how = run.timedOut
          ? `did not finish in ${String(GENERATOR_TIMEOUT_MS / 60000)} minutes and was stopped`
          : run.status === null
            ? `could not run (${run.signal ?? 'no exit code'})`
            : `exited ${String(run.status)}`
        for (const path of generator.paths) {
          decide(
            verdict,
            path,
            'regenerates',
            false,
            `\`${said}\` ${how}, so this file was not shown to be its output and is not accepted as generated; ${lastWords(run.output)}.${leftNote}`,
          )
        }
        continue
      }
      for (const path of generator.paths) {
        const have = committed.get(path) ?? null
        const want = bytesAt(tree, path)
        if (have === null && want === null) {
          decide(verdict, path, 'regenerates', true, `Neither the change nor \`${said}\` has this file.${leftNote}`)
        } else if (have === null) {
          decide(verdict, path, 'regenerates', false, `The change has no such file, and \`${said}\` writes one of ${String(want.length)} bytes.${leftNote}`)
        } else if (want === null) {
          decide(verdict, path, 'regenerates', false, `After \`${said}\` ran, the file was gone; the change has ${String(have.length)} bytes.${leftNote}`)
        } else if (have.equals(want)) {
          decide(verdict, path, 'regenerates', true, `\`${said}\` writes exactly these ${String(have.length)} bytes.${leftNote}`)
        } else {
          decide(
            verdict,
            path,
            'regenerates',
            false,
            `It is not what \`${said}\` writes (${String(have.length)} bytes in the change, ${String(want.length)} from the generator); ${firstDifference(have, want)}. Run the generator and commit what it writes.${leftNote}`,
          )
        }
      }
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

finish(TOOL, checked, verdict)
