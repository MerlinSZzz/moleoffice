// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MERGE TOOL AS ONE COMMAND LINE, WITH NO OFFICE.
 *
 * A project that runs the merge tool alone writes one configuration file and runs three subcommands:
 * `submit` puts a branch in the project's local queue, `list` reads the queue, and `run` carries each
 * entry that is submitted, judged or integrating, skips each entry that is final, and refuses an entry
 * that is testing or landing. The queue lives in the local keeper's folder under ~/.cache/merge-tool,
 * and the work of one entry happens in a scratch worktree there, never inside the project repository.
 *
 * It sends no request and loads no office module. It reads the configuration with config.mjs, the queue
 * with local-keeper.mjs, node's own modules, and git. A keeper refusal is printed as the sentence it
 * gave and the command line exits 1.
 */

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { MERGE_STATES, MERGE_STATE_SPECS } from '../../src/shared/merge-queue.ts'
import { protectingPattern, readProtectedAreas } from '../checks/protected-areas.mjs'
import { readTheConfigurationFile, theGitIdentityOf } from './config.mjs'
import { openTheLocalKeeper } from './local-keeper.mjs'
import { THE_OPTION_WORDS, theCommandNamed } from './the-command-words.mjs'

const SESSION = 'the command line'
/** The one report the command line reads: it reads the suite's exit code, not a report file. */
const THE_REPORT_THE_COMMAND_LINE_READS = 'exit-code-only'
/** Every state the shared table calls final, read from that one table. */
const FINAL_STATES = new Set(MERGE_STATES.filter((state) => MERGE_STATE_SPECS[state].final))
const MOST_OUTPUT = 64 * 1024 * 1024

function say(text) {
  process.stdout.write(`${text}\n`)
}

function refuse(error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
}

function readOptions(command, words) {
  const taken = new Map(command.options.map((option) => [option.word, option]))
  const options = {}
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index]
    const option = taken.get(word)
    if (option === undefined) {
      if (THE_OPTION_WORDS.includes(word)) {
        throw new Error(`The command "${command.name}" does not take the option "${word}".`)
      }
      throw new Error(`The command line does not know the option "${String(word)}".`)
    }
    if (option.value === null) {
      options[option.name] = true
      continue
    }
    const value = words[index + 1]
    if (value === undefined) {
      throw new Error(`The option "${word}" needs a value after it.`)
    }
    options[option.name] = value
    index += 1
  }
  for (const option of command.options) {
    if (option.required && options[option.name] === undefined) {
      throw new Error(`The command "${command.name}" needs the option "${option.word}" and its value.`)
    }
  }
  return options
}

/**
 * THE CONFIGURATION VALUES THE COMMAND LINE CANNOT ACT ON, refused in one sentence naming every one of them.
 * The command line acts on the repository, the trunk, the build and suite commands, the landing commands,
 * the protected-path file and the commit identity. These four values would change what a report, a health
 * check, a marker search or a test-per-change gate asks for, and the command line does none of that.
 */
function theValuesTheCommandLineCannotActOn(configuration, file) {
  const wrong = []
  if (configuration.test.report !== THE_REPORT_THE_COMMAND_LINE_READS) {
    wrong.push(`"test.report" is ${JSON.stringify(configuration.test.report)}, and the command line reads only the exit code`)
  }
  if (configuration.land.healthy !== null) {
    wrong.push('"land.healthy" is not null, and the command line checks no health after a landing')
  }
  if (configuration.gates.markers !== null) {
    wrong.push('"gates.markers" is not null, and the command line does not look for mutation markers')
  }
  if (configuration.gates.tests !== false) {
    wrong.push(`"gates.tests" is ${JSON.stringify(configuration.gates.tests)}, and the command line does not run the gate that wants a test with each code change`)
  }
  if (wrong.length === 0) return
  throw new Error(`The configuration file ${file} holds ${wrong.length === 1 ? 'a value' : 'values'} the command line cannot act on: ${wrong.join('; ')}.`)
}

function theConfiguration(options) {
  const configuration = readTheConfigurationFile(options.config)
  theValuesTheCommandLineCannotActOn(configuration, options.config)
  return configuration
}

function aGitResult(cwd, configuration, args) {
  return spawnSync('git', ['-c', 'gc.auto=0', '-C', cwd, ...args], {
    cwd,
    env: { ...process.env, ...theGitIdentityOf(configuration) },
    encoding: 'utf8',
    maxBuffer: MOST_OUTPUT,
  })
}

function theGitFailure(ran) {
  const said = `${ran.stderr ?? ''}`.trim() || `${ran.stdout ?? ''}`.trim()
  return said || `git exited ${String(ran.status)}`
}

function theGitText(cwd, configuration, args, what) {
  const ran = aGitResult(cwd, configuration, args)
  if (ran.status !== 0) {
    throw new Error(`git could not ${what}: ${theGitFailure(ran)}`)
  }
  return `${ran.stdout}`.trim()
}

function linesOf(text) {
  return `${text}`
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
}

function aCommandResult(command, cwd, configuration) {
  return spawnSync(command[0], command.slice(1), {
    cwd,
    env: { ...process.env, ...theGitIdentityOf(configuration) },
    encoding: 'utf8',
    maxBuffer: MOST_OUTPUT,
  })
}

function submit(options) {
  const configuration = theConfiguration(options)
  const commit = theGitText(
    configuration.repository,
    configuration,
    ['rev-parse', `${options.branch}^{commit}`],
    `resolve the branch "${options.branch}"`,
  )
  const base = theGitText(
    configuration.repository,
    configuration,
    ['merge-base', configuration.trunk, commit],
    `find where "${options.branch}" left "${configuration.trunk}"`,
  )
  const id = options.id ?? createHash('sha256').update(`${options.branch}:${commit}`).digest('hex').slice(0, 12)
  const keeper = openTheLocalKeeper({ repository: configuration.repository })
  const entry = { id, branch: options.branch, commit, base }
  if (options.title !== undefined) entry.title = options.title
  keeper.addAnEntry(entry)
  say(`submitted ${id} ${options.branch} ${commit}`)
}

function list(options) {
  const configuration = theConfiguration(options)
  const keeper = openTheLocalKeeper({ repository: configuration.repository })
  const entries = keeper.entries()
  if (options.json === true) {
    say(JSON.stringify(entries, null, 2))
    return
  }
  for (const entry of entries) {
    say([entry.id, entry.state, entry.branch ?? '', entry.commit ?? '', entry.title ?? ''].join(' '))
    if (entry.state === 'bounced') {
      say(`bounced: ${entry.bounced?.reason ?? 'no reason was recorded'}`)
    }
  }
}

function theProtectedAreas(configuration) {
  const file = resolve(configuration.repository, configuration.gates.areas)
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch (error) {
    throw new Error(`The protected-paths file ${file} could not be read: ${error instanceof Error ? error.message : String(error)}`)
  }
  return readProtectedAreas(text, file)
}

function theProtectedChangedPaths(areas, changed) {
  return changed.filter((path) => protectingPattern(areas, path) !== null)
}

function theFirstRedCommand(configuration, scratch) {
  for (const command of [configuration.test.build, configuration.test.suite]) {
    const ran = aCommandResult(command, scratch, configuration)
    if (ran.status !== 0) return command.join(' ')
  }
  return null
}

function removeTheScratch(configuration, scratch) {
  if (scratch === null) return
  aGitResult(configuration.repository, configuration, ['worktree', 'remove', '--force', scratch])
  rmSync(scratch, { recursive: true, force: true })
  aGitResult(configuration.repository, configuration, ['worktree', 'prune'])
}

function integrate(keeper, configuration, entry, scratch, areas) {
  mkdirSync(dirname(scratch), { recursive: true })
  rmSync(scratch, { recursive: true, force: true })
  const added = aGitResult(configuration.repository, configuration, ['worktree', 'add', '--detach', '--force', scratch, entry.commit])
  if (added.status !== 0) {
    throw new Error(`The scratch worktree could not be made: ${theGitFailure(added)}`)
  }

  const mainAt = theGitText(
    configuration.repository,
    configuration,
    ['rev-parse', configuration.trunk],
    `read "${configuration.trunk}"`,
  )
  const rebased = aGitResult(scratch, configuration, ['rebase', configuration.trunk])
  if (rebased.status !== 0) {
    const conflicted = aGitResult(scratch, configuration, ['diff', '--name-only', '--diff-filter=U'])
    const files = conflicted.status === 0 ? linesOf(conflicted.stdout) : []
    aGitResult(scratch, configuration, ['rebase', '--abort'])
    const bounced = keeper.step(entry.id, 'conflict', { files })
    say(`bounced ${bounced.bounced?.reason ?? 'conflict'}`)
    return { status: 'bounced' }
  }

  const changed = linesOf(
    theGitText(scratch, configuration, ['diff', '--name-only', configuration.trunk, 'HEAD'], 'read the changed paths'),
  )
  const protectedChanged = theProtectedChangedPaths(areas, changed)
  if (protectedChanged.length > 0) {
    const bounced = keeper.step(entry.id, 'guard-failed', { guard: 'protected-path', files: protectedChanged })
    say(`bounced ${bounced.bounced?.reason ?? 'guard'}`)
    return { status: 'bounced' }
  }

  keeper.step(entry.id, 'integrated', { files: changed, mainAt })

  const red = theFirstRedCommand(configuration, scratch)
  if (red !== null) {
    const bounced = keeper.step(entry.id, 'tested', { green: false, files: [red] })
    say(`bounced ${bounced.bounced?.reason ?? 'red'}`)
    return { status: 'bounced' }
  }

  const testing = keeper.step(entry.id, 'tested', { green: true })
  return { status: 'ready', entry: testing, changed, mainAt }
}

/** The branch the project checkout has checked out, or null when its HEAD is detached. */
function theBranchCheckedOut(configuration) {
  const ran = aGitResult(configuration.repository, configuration, ['symbolic-ref', '--quiet', '--short', 'HEAD'])
  if (ran.status !== 0) return null
  return `${ran.stdout}`.trim()
}

/** Landing moves the trunk, so the checkout must be on the named trunk before anything moves. */
function checkTheCheckoutIsOnTheTrunk(configuration) {
  const checkedOut = theBranchCheckedOut(configuration)
  if (checkedOut === configuration.trunk) return
  throw new Error(
    `The project checkout is on ${checkedOut === null ? 'no branch' : `the branch "${checkedOut}"`}, not on the trunk "${configuration.trunk}", so nothing was landed.`,
  )
}

function landTheChange(keeper, configuration, id, scratch, changed) {
  checkTheCheckoutIsOnTheTrunk(configuration)

  for (const command of configuration.land.before) {
    const ran = aCommandResult(command, configuration.repository, configuration)
    if (ran.status !== 0) {
      throw new Error(`The command ${command.join(' ')} failed before the landing, so nothing was landed.`)
    }
  }

  const head = theGitText(scratch, configuration, ['rev-parse', 'HEAD'], 'read the scratch commit')
  const merged = aGitResult(configuration.repository, configuration, ['merge', '--ff-only', head])
  if (merged.status !== 0) {
    throw new Error(`The trunk could not be fast-forwarded to the entry: ${theGitFailure(merged)}`)
  }

  for (const step of configuration.land.after) {
    if (!changed.some((path) => path.startsWith(step.whenAPathIsUnder))) continue
    const ran = aCommandResult(step.run, configuration.repository, configuration)
    if (ran.status !== 0) {
      throw new Error(`The command ${step.run.join(' ')} failed after the landing.`)
    }
  }

  const commit = theGitText(
    configuration.repository,
    configuration,
    ['rev-parse', configuration.trunk],
    `read "${configuration.trunk}"`,
  )
  keeper.step(id, 'landed', { commit, mainAt: commit })
  say(`landed ${commit}`)
}

function carryAnEntry(keeper, configuration, id, areas) {
  let failed = false
  let ended = false
  let threw = false
  let reason = 'the command line finished with the entry'
  let scratch = null

  function endTheRun() {
    if (ended) return
    ended = true
    try {
      keeper.toolEnded(id, { session: SESSION, reason })
    } catch (error) {
      refuse(error)
      failed = true
    }
  }

  try {
    keeper.toolStarted(id, { session: SESSION })
  } catch (error) {
    refuse(error)
    return false
  }

  try {
    let entry = keeper.readEntry(id)

    if (entry.state === 'submitted') {
      entry = keeper.step(id, 'pinned')
      say(entry.state)
    }

    if (entry.state === 'judged') {
      try {
        entry = keeper.step(id, 'integrating')
        say(entry.state)
      } catch (error) {
        refuse(error)
        failed = true
        return false
      }
    }

    let changed = []
    let mainAt = ''
    let integratedNow = false

    if (entry.state === 'integrating') {
      scratch = join(keeper.place.folder, 'work', id)
      const integrated = integrate(keeper, configuration, entry, scratch, areas)
      if (integrated.status === 'bounced') return true
      if (integrated.status !== 'ready') {
        failed = true
        return false
      }
      entry = integrated.entry
      changed = integrated.changed
      mainAt = integrated.mainAt
      integratedNow = true
      say(entry.state)
    }

    if (!integratedNow) {
      throw new Error(`The entry is ${entry.state}, and the command line has nothing it can carry from that state.`)
    }

    checkTheCheckoutIsOnTheTrunk(configuration)
    if (entry.state === 'testing') {
      entry = keeper.step(id, 'landing')
      say(entry.state)
    }

    const currentTrunk = theGitText(
      configuration.repository,
      configuration,
      ['rev-parse', configuration.trunk],
      `read "${configuration.trunk}"`,
    )
    if (currentTrunk !== mainAt) {
      const moved = keeper.step(id, 'main-moved', { mainAt: currentTrunk })
      if (moved.state === 'bounced') {
        say(`bounced ${moved.bounced?.reason ?? 'churn'}`)
        return true
      }
      say(moved.state)
      return false
    }

    landTheChange(keeper, configuration, id, scratch, changed)
    return true
  } catch (error) {
    reason = 'the command line could not carry the entry'
    threw = true
    refuse(error)
    failed = true
    return false
  } finally {
    let state = null
    try {
      state = keeper.readEntry(id).state
    } catch {
      state = null
    }
    if (threw || (state !== null && FINAL_STATES.has(state))) endTheRun()
    removeTheScratch(configuration, scratch)
  }
}

function run(options) {
  const configuration = theConfiguration(options)
  const areas = theProtectedAreas(configuration)
  if (areas.generated.length > 0) {
    const file = resolve(configuration.repository, configuration.gates.areas)
    throw new Error(`The protected-paths file ${file} has a non-empty "generated" list, and the command line does not regenerate or check generated files.`)
  }
  const keeper = openTheLocalKeeper({ repository: configuration.repository })
  const seat = keeper.takeTheSeat({ session: SESSION })
  if (!seat.seat) {
    throw new Error(seat.says)
  }
  try {
    const queue = keeper.entries()
    const chosen =
      options.entry === undefined ? queue : queue.filter((entry) => entry.id === options.entry)

    if (options.entry !== undefined && chosen.length === 0) {
      throw new Error(`The queue has no merge entry ${options.entry}.`)
    }

    let failed = false
    for (const entry of chosen) {
      if (FINAL_STATES.has(entry.state)) continue
      if (!carryAnEntry(keeper, configuration, entry.id, areas)) failed = true
    }
    return failed ? 1 : 0
  } finally {
    keeper.releaseTheSeat()
  }
}

/** What each command does, keyed by the command's own name. */
const THE_WORK_OF_THE_COMMANDS = { submit, list, run }

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const command = theCommandNamed(process.argv[2])
    const options = readOptions(command, process.argv.slice(3))
    const work = Object.hasOwn(THE_WORK_OF_THE_COMMANDS, command.name) ? THE_WORK_OF_THE_COMMANDS[command.name] : undefined
    if (work === undefined) {
      throw new Error(`The command line has no work for the command "${command.name}".`)
    }
    process.exitCode = work(options) ?? 0
  } catch (error) {
    refuse(error)
    process.exitCode = 1
  }
}
